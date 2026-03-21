import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  createSuspendedUserApi,
  listComplaintsApi,
  listSuspendedUsersApi,
  listUsers,
  updateComplaintApi,
  updateSuspendedUserApi,
  type BackendComplaint,
  type BackendSuspendedUser,
  type BackendUser,
} from '@/api';
import { Users, Search, UserCheck, Truck, Recycle, Building2, Eye, ShieldBan, ShieldCheck, Phone, MapPin, Calendar, Award, MessageSquare, Send, Mail } from 'lucide-react';
import { toast } from 'sonner';

type UserRole = 'resident' | 'collector' | 'recycler' | 'authority';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  location: string;
  rewardPoints: number;
  createdAt: string;
}

const roleIcons: Record<UserRole, typeof Users> = {
  resident: UserCheck,
  collector: Truck,
  recycler: Recycle,
  authority: Building2,
};

const roleBadgeColors: Record<UserRole, string> = {
  resident: 'bg-primary/20 text-primary',
  collector: 'bg-info/20 text-info',
  recycler: 'bg-success/20 text-success',
  authority: 'bg-accent/20 text-accent',
};

interface Complaint {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  details: string;
  phone: string;
  status: 'pending' | 'replied';
  reply?: string;
  createdAt: string;
}

const mapBackendUserToAuthorityUser = (backendUser: BackendUser): User => {
  const fullName = `${backendUser.first_name || ''} ${backendUser.last_name || ''}`.trim();
  const roleByType: Record<BackendUser['user_type'], UserRole> = {
    household: 'resident',
    collector: 'collector',
    recycler: 'recycler',
    authority: 'authority',
  };

  return {
    id: String(backendUser.id),
    name: fullName || backendUser.username || backendUser.email,
    email: backendUser.email,
    role: roleByType[backendUser.user_type],
    phone: backendUser.phone || '',
    location: backendUser.location || '',
    rewardPoints: backendUser.reward_points ?? 0,
    createdAt: '',
  };
};

const mapBackendComplaint = (row: BackendComplaint): Complaint => ({
  id: String(row.id),
  userId: row.reporter ? String(row.reporter) : '',
  userName: row.reporter_name || 'Unknown',
  userEmail: row.reporter_email || '',
  subject: row.subject,
  details: row.details,
  phone: row.phone || row.reporter_phone || '',
  status: row.status === 'replied' ? 'replied' : 'pending',
  reply: row.reply || '',
  createdAt: row.created_at,
});

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [suspendedRecords, setSuspendedRecords] = useState<BackendSuspendedUser[]>([]);
  const [profileDialog, setProfileDialog] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [suspendDialog, setSuspendDialog] = useState<{ open: boolean; user: User | null; action: 'suspend' | 'reactivate' }>({ open: false, user: null, action: 'suspend' });
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [replyDialog, setReplyDialog] = useState<{ open: boolean; complaint: Complaint | null }>({ open: false, complaint: null });
  const [replyText, setReplyText] = useState('');
  const [showComplaints, setShowComplaints] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const [backendUsers, suspendedRows, complaintRows] = await Promise.all([
          listUsers(),
          listSuspendedUsersApi(),
          listComplaintsApi(),
        ]);
        if (!active) return;
        setUsers(backendUsers.map(mapBackendUserToAuthorityUser));
        setSuspendedRecords(suspendedRows);
        setComplaints(complaintRows.map(mapBackendComplaint));
      } catch {
        if (active) {
          setUsers([]);
          setSuspendedRecords([]);
          setComplaints([]);
          toast.error('Failed to load users from database');
        }
      } finally {
        if (active) {
          setIsLoadingUsers(false);
        }
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const roleCounts = {
    resident: users.filter(u => u.role === 'resident').length,
    collector: users.filter(u => u.role === 'collector').length,
    recycler: users.filter(u => u.role === 'recycler').length,
    authority: users.filter(u => u.role === 'authority').length,
  };

  const isSuspended = (userId: string) =>
    suspendedRecords.some((record) => record.active && String(record.user) === userId);
  const pendingComplaints = complaints.filter(c => c.status === 'pending');

  const handleSuspend = async (user: User) => {
    try {
      const reason = 'Account suspended by county authority review';
      await createSuspendedUserApi({ user: Number(user.id), reason, active: true });
      const refreshed = await listSuspendedUsersApi();
      setSuspendedRecords(refreshed);
      setSuspendDialog({ open: false, user: null, action: 'suspend' });
      toast.success(`${user.name}'s account has been suspended`);
    } catch {
      toast.error('Failed to suspend user account');
    }
  };

  const handleReactivate = async (user: User) => {
    try {
      const activeRecord = suspendedRecords.find(
        (record) => record.active && String(record.user) === user.id
      );
      if (!activeRecord) {
        toast.error('No active suspension record found');
        return;
      }
      await updateSuspendedUserApi(activeRecord.id, { active: false });
      const refreshed = await listSuspendedUsersApi();
      setSuspendedRecords(refreshed);
      setSuspendDialog({ open: false, user: null, action: 'reactivate' });
      toast.success(`${user.name}'s account has been reactivated`);
    } catch {
      toast.error('Failed to reactivate user account');
    }
  };

  const handleReplyComplaint = async () => {
    if (!replyDialog.complaint) return;
    // Open email client with pre-filled mailto link
    const subject = encodeURIComponent(`Re: ${replyDialog.complaint.subject} - M-Taka Account Review`);
    const body = encodeURIComponent(
      `Dear ${replyDialog.complaint.userName},\n\nRegarding your complaint: "${replyDialog.complaint.subject}"\n\n${replyText ? replyText + '\n\n' : ''}Best regards,\nCounty Authority\nM-Taka Platform`
    );
    window.open(`mailto:${replyDialog.complaint.userEmail}?subject=${subject}&body=${body}`, '_blank');
    
    try {
      await updateComplaintApi(Number(replyDialog.complaint.id), {
        status: 'replied',
        reply: replyText || 'Replied via email',
      });
      setComplaints((current) =>
        current.map((item) =>
          item.id === replyDialog.complaint!.id
            ? { ...item, status: 'replied', reply: replyText || 'Replied via email' }
            : item
        )
      );
    } catch {
      toast.error('Failed to update complaint status');
      return;
    }

    setReplyDialog({ open: false, complaint: null });
    setReplyText('');
    toast.success(`Email client opened for ${replyDialog.complaint.userEmail}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-muted-foreground">View profiles and manage platform users</p>
          </div>
          {pendingComplaints.length > 0 && (
            <Button variant={showComplaints ? 'default' : 'outline'} size="sm" onClick={() => setShowComplaints(!showComplaints)} className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Complaints ({pendingComplaints.length})
            </Button>
          )}
        </div>

        {/* Complaints Section */}
        {showComplaints && complaints.length > 0 && (
          <Card className="border-warning/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-warning" />
                Suspension Complaints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {complaints.map((complaint) => (
                  <div key={complaint.id} className={`p-4 rounded-lg border ${complaint.status === 'pending' ? 'border-warning/30 bg-warning/5' : 'border-border bg-card'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{complaint.userName}</span>
                          <Badge variant={complaint.status === 'pending' ? 'default' : 'secondary'}>
                            {complaint.status}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">{complaint.subject}</p>
                        <p className="text-sm mt-1">{complaint.details}</p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{complaint.userEmail}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{complaint.phone}</span>
                          <span>{new Date(complaint.createdAt).toLocaleDateString()}</span>
                        </div>
                        {complaint.reply && (
                          <div className="mt-2 p-2 rounded bg-success/10 text-sm">
                            <span className="font-medium text-success">Your Reply: </span>{complaint.reply}
                          </div>
                        )}
                      </div>
                      {complaint.status === 'pending' && (
                        <Button size="sm" onClick={() => { setReplyDialog({ open: true, complaint }); setReplyText(''); }}>
                          <Send className="w-4 h-4 mr-1" />Reply
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Role Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(Object.keys(roleCounts) as UserRole[]).map((role) => {
            const Icon = roleIcons[role];
            return (
              <Card
                key={role}
                className={`cursor-pointer transition-all ${filterRole === role ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setFilterRole(filterRole === role ? 'all' : role)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Icon className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">{roleCounts[role]}</p>
                      <p className="text-xs text-muted-foreground capitalize">{role}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Users ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingUsers ? (
              <p className="text-muted-foreground text-center py-8">Loading users...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No users found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">User</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Role</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Points</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-border/50">
                        <td className="py-3 px-2">
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <Badge className={roleBadgeColors[u.role]}>{u.role}</Badge>
                        </td>
                        <td className="py-3 px-2">
                          {isSuspended(u.id) ? (
                            <Badge className="bg-destructive/20 text-destructive">Suspended</Badge>
                          ) : (
                            <Badge className="bg-success/20 text-success">Active</Badge>
                          )}
                        </td>
                        <td className="py-3 px-2 text-sm font-medium">{u.rewardPoints}</td>
                        <td className="py-3 px-2">
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setProfileDialog({ open: true, user: u })}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {u.role !== 'authority' ? (
                              isSuspended(u.id) ? (
                                <Button size="sm" variant="outline" className="text-success" onClick={() => setSuspendDialog({ open: true, user: u, action: 'reactivate' })}>
                                  <ShieldCheck className="w-4 h-4" />
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setSuspendDialog({ open: true, user: u, action: 'suspend' })}>
                                  <ShieldBan className="w-4 h-4" />
                                </Button>
                              )
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profile Dialog */}
      <Dialog open={profileDialog.open} onOpenChange={(open) => setProfileDialog({ open, user: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>User Profile</DialogTitle></DialogHeader>
          {profileDialog.user && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">{profileDialog.user.name.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold">{profileDialog.user.name}</h3>
                  <Badge className={roleBadgeColors[profileDialog.user.role]}>{profileDialog.user.role}</Badge>
                  {isSuspended(profileDialog.user.id) && <Badge className="bg-destructive/20 text-destructive ml-2">Suspended</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm font-medium">{profileDialog.user.email}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm font-medium">{profileDialog.user.phone}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Location</p><p className="text-sm font-medium">{profileDialog.user.location}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <Award className="w-4 h-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Reward Points</p><p className="text-sm font-medium">{profileDialog.user.rewardPoints}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Joined</p><p className="text-sm font-medium">{profileDialog.user.createdAt ? new Date(profileDialog.user.createdAt).toLocaleDateString() : '-'}</p></div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialog({ open: false, user: null })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/Reactivate Dialog */}
      <Dialog open={suspendDialog.open} onOpenChange={(open) => setSuspendDialog({ open, user: null, action: 'suspend' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{suspendDialog.action === 'suspend' ? 'Suspend User Account' : 'Reactivate User Account'}</DialogTitle>
          </DialogHeader>
          {suspendDialog.user && (
            <div className="py-4">
              <div className="p-4 bg-secondary/50 rounded-lg mb-4">
                <p className="font-medium">{suspendDialog.user.name}</p>
                <p className="text-sm text-muted-foreground">{suspendDialog.user.email}</p>
                <Badge className={roleBadgeColors[suspendDialog.user.role]}>{suspendDialog.user.role}</Badge>
              </div>
              <p className="text-muted-foreground">
                {suspendDialog.action === 'suspend'
                  ? 'This will prevent the user from logging in or accessing any system features. Are you sure?'
                  : 'This will restore the user\'s access to the system. Are you sure?'}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialog({ open: false, user: null, action: 'suspend' })}>Cancel</Button>
            {suspendDialog.user && suspendDialog.action === 'suspend' ? (
              <Button variant="destructive" onClick={() => handleSuspend(suspendDialog.user!)}>
                <ShieldBan className="w-4 h-4 mr-2" />Suspend Account
              </Button>
            ) : suspendDialog.user ? (
              <Button onClick={() => handleReactivate(suspendDialog.user!)}>
                <ShieldCheck className="w-4 h-4 mr-2" />Reactivate Account
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reply to Complaint Dialog */}
      <Dialog open={replyDialog.open} onOpenChange={(open) => { setReplyDialog({ open, complaint: null }); setReplyText(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to Complaint</DialogTitle>
          </DialogHeader>
          {replyDialog.complaint && (
            <div className="space-y-4 py-4">
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="font-medium">{replyDialog.complaint.userName} ({replyDialog.complaint.userEmail})</p>
                <p className="text-sm text-muted-foreground mt-1"><strong>Subject:</strong> {replyDialog.complaint.subject}</p>
                <p className="text-sm mt-1">{replyDialog.complaint.details}</p>
                <p className="text-xs text-muted-foreground mt-2">Phone: {replyDialog.complaint.phone}</p>
              </div>
              <div className="space-y-2">
                <Label>Your Reply</Label>
                <Textarea
                  placeholder="Include reason for suspension, required actions, or confirmation of unsuspension..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReplyDialog({ open: false, complaint: null }); setReplyText(''); }}>Cancel</Button>
            <Button onClick={handleReplyComplaint} disabled={!replyText.trim()}>
              <Send className="w-4 h-4 mr-2" />Send Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

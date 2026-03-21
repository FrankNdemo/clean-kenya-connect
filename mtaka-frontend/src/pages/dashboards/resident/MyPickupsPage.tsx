import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { 
  getRequestUpdates,
  createCollectorUpdate,
  getUser,
  WasteRequest
} from '@/lib/store';
import { deleteWasteRequestDb, fetchCurrentUserCollectionRequests, updateWasteRequestDb } from '@/lib/collectionRequestsApi';
import { 
  Truck, 
  Clock, 
  CheckCircle, 
  XCircle, 
  MapPin, 
  Calendar,
  Edit,
  Trash2,
  Eye,
  MessageSquare,
  AlertTriangle,
  Send,
  Phone
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function MyPickupsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WasteRequest[]>([]);
  const [editDialog, setEditDialog] = useState<{ open: boolean; request: WasteRequest | null }>({
    open: false,
    request: null,
  });
  const [viewDialog, setViewDialog] = useState<{ open: boolean; request: WasteRequest | null }>({
    open: false,
    request: null,
  });
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; requestId: string }>({
    open: false,
    requestId: '',
  });
  const [replyDialog, setReplyDialog] = useState<{ open: boolean; request: WasteRequest | null }>({
    open: false,
    request: null,
  });
  const [editForm, setEditForm] = useState({
    date: '',
    time: '',
    location: '',
    notes: '',
  });
  const [replyMessage, setReplyMessage] = useState('');

  const refreshRequests = async () => {
    try {
      const data = await fetchCurrentUserCollectionRequests();
      setRequests(data);
    } catch (error) {
      setRequests([]);
    }
  };

  useEffect(() => {
    if (!user) return;
    refreshRequests();
  }, [user]);

  if (!user) return null;

  const activeRequests = requests.filter(r => 
    r.status === 'pending' || r.status === 'accepted'
  );
  const completedRequests = requests.filter(r => r.status === 'completed');
  const cancelledRequests = requests.filter(r => 
    r.status === 'cancelled' || r.status === 'declined'
  );

  const handleEdit = (request: WasteRequest) => {
    setEditForm({
      date: request.date,
      time: request.time,
      location: request.location,
      notes: request.notes || '',
    });
    setEditDialog({ open: true, request });
  };

  const handleSaveEdit = async () => {
    if (!editDialog.request) return;
    
    await updateWasteRequestDb(editDialog.request.id, {
      date: editForm.date,
      time: editForm.time,
      location: editForm.location,
      notes: editForm.notes,
    });
    
    toast.success('Pickup request updated');
    setEditDialog({ open: false, request: null });
    await refreshRequests();
  };

  const handleCancel = async () => {
    await updateWasteRequestDb(cancelDialog.requestId, {
      status: 'cancelled',
    });
    
    toast.success('Pickup request cancelled');
    setCancelDialog({ open: false, requestId: '' });
    await refreshRequests();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this request?')) {
      await deleteWasteRequestDb(id);
      toast.success('Request deleted');
      await refreshRequests();
    }
  };

  const handleSendReply = () => {
    if (!replyDialog.request || !replyMessage.trim()) return;
    
    createCollectorUpdate({
      requestId: replyDialog.request.id,
      collectorId: replyDialog.request.collectorId || '',
      collectorName: replyDialog.request.collectorName || 'Collector',
      type: 'resident_reply',
      message: replyMessage,
      residentId: user.id,
      residentName: user.name,
    });
    
    toast.success('Reply sent to collector');
    setReplyDialog({ open: false, request: null });
    setReplyMessage('');
    refreshRequests();
  };

  const getStatusBadge = (status: WasteRequest['status']) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-warning/20 text-warning-foreground">Pending</Badge>;
      case 'accepted':
        return <Badge className="bg-info/20 text-info">Accepted</Badge>;
      case 'collected':
        return <Badge className="bg-primary/20 text-primary">Collected</Badge>;
      case 'completed':
        return <Badge className="bg-success/20 text-success">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-muted text-muted-foreground">Cancelled</Badge>;
      case 'declined':
        return <Badge className="bg-destructive/20 text-destructive">Declined</Badge>;
    }
  };

  const getWasteTypeLabel = (type: WasteRequest['wasteType']) => {
    switch (type) {
      case 'organic': return '🥬 Organic';
      case 'recyclable': return '♻️ Recyclable';
      case 'hazardous': return '⚠️ Hazardous';
      case 'general': return '🗑️ General';
    }
  };

  const RequestCard = ({ request, showActions = true }: { request: WasteRequest; showActions?: boolean }) => {
    const updates = getRequestUpdates(request.id);
    
    return (
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{getWasteTypeLabel(request.wasteType).split(' ')[0]}</span>
              <span className="font-semibold">{getWasteTypeLabel(request.wasteType).split(' ')[1]}</span>
              {getStatusBadge(request.status)}
            </div>
            
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {request.date} at {request.time}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {request.location}
              </div>
              {request.collectorName && (
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Collector: {request.collectorName}
                </div>
              )}
              {(request.status === 'pending' || request.status === 'accepted') && request.collectorId && (() => {
                const collector = getUser(request.collectorId!);
                const phone = collector?.phone;
                return phone ? (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${phone}`} className="text-primary underline hover:text-primary/80">{phone}</a>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Collector Updates */}
            {updates.length > 0 && (
              <div className="mt-3 space-y-2">
                {updates.map(update => (
                  <div 
                    key={update.id} 
                    className={`p-3 rounded-lg text-sm ${
                      update.type === 'delay' ? 'bg-warning/10' :
                      update.type === 'declined' ? 'bg-destructive/10' :
                      update.type === 'resident_reply' ? 'bg-info/10' :
                      'bg-info/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4" />
                      <span className="font-medium">
                        {update.type === 'resident_reply' 
                          ? `Your reply` 
                          : `Update from ${update.collectorName}`
                        }
                      </span>
                    </div>
                    <p className="text-muted-foreground">{update.message}</p>
                    {update.newDate && (
                      <p className="text-xs mt-1">
                        New date: {update.newDate} at {update.newTime}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Decline reason */}
            {request.status === 'declined' && request.declineReason && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/10">
                <p className="text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  Declined: {request.declineReason}
                </p>
              </div>
            )}

            {/* Completion notes */}
            {request.status === 'completed' && request.completionNotes && (
              <div className="mt-3 p-3 rounded-lg bg-success/10">
                <p className="text-sm text-success">
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  {request.completionNotes}
                </p>
              </div>
            )}
          </div>

          {showActions && (
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setViewDialog({ open: true, request })}
              >
                <Eye className="w-4 h-4" />
              </Button>
              
              {/* Reply/Message button for active requests */}
              {(request.status === 'pending' || request.status === 'accepted') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setReplyDialog({ open: true, request })}
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
              
              {(request.status === 'pending' || request.status === 'accepted') && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(request)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setCancelDialog({ open: true, requestId: request.id })}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </>
              )}
              {(request.status === 'cancelled' || request.status === 'declined') && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => handleDelete(request.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Pickup Requests</h1>
            <p className="text-muted-foreground">Manage and track your waste collection requests</p>
          </div>
          <Link to="/waste/schedule">
            <Button className="gap-2">
              <Truck className="w-4 h-4" />
              Schedule New Pickup
            </Button>
          </Link>
        </div>

        {/* Active Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Active Requests ({activeRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No active pickup requests</p>
                <Link to="/waste/schedule">
                  <Button variant="link">Schedule a pickup</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {activeRequests.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Requests */}
        {completedRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                Completed ({completedRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {completedRequests.slice(0, 5).map((request) => (
                  <RequestCard key={request.id} request={request} showActions={true} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cancelled/Declined Requests */}
        {cancelledRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-muted-foreground" />
                Cancelled/Declined ({cancelledRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cancelledRequests.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, request: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pickup Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={editForm.time}
                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, request: null })}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyDialog.open} onOpenChange={(open) => setReplyDialog({ open, request: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to Collector</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {replyDialog.request && (
              <div className="p-3 bg-secondary/50 rounded-lg">
                <p className="text-sm font-medium">Replying about: {getWasteTypeLabel(replyDialog.request.wasteType)}</p>
                <p className="text-xs text-muted-foreground">
                  Collector: {replyDialog.request.collectorName || 'Not assigned'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Your Message</Label>
              <Textarea
                placeholder="Type your reply to the collector..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialog({ open: false, request: null })}>
              Cancel
            </Button>
            <Button onClick={handleSendReply} disabled={!replyMessage.trim()}>
              <Send className="w-4 h-4 mr-2" />
              Send Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ open, requestId: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Pickup Request</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground mb-4">
              Are you sure you want to cancel this pickup request?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog({ open: false, requestId: '' })}>
              Keep Request
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog({ open, request: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pickup Request Details</DialogTitle>
          </DialogHeader>
          {viewDialog.request && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Waste Type</p>
                  <p className="font-medium">{getWasteTypeLabel(viewDialog.request.wasteType)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(viewDialog.request.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date & Time</p>
                  <p className="font-medium">{viewDialog.request.date} at {viewDialog.request.time}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">{viewDialog.request.location}</p>
                </div>
              </div>
              {viewDialog.request.collectorName && (
                <div>
                  <p className="text-sm text-muted-foreground">Collector</p>
                  <p className="font-medium">{viewDialog.request.collectorName}</p>
                </div>
              )}
              {viewDialog.request.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p>{viewDialog.request.notes}</p>
                </div>
              )}
              {viewDialog.request.completionNotes && (
                <div className="p-3 rounded-lg bg-success/10">
                  <p className="text-sm text-muted-foreground">Completion Notes</p>
                  <p className="text-success">{viewDialog.request.completionNotes}</p>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Created: {new Date(viewDialog.request.createdAt).toLocaleString()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import {
  deleteUserApi,
  listUsers,
  updateUserPasswordApi,
  type BackendUser,
} from '@/api';
import {
  CheckCircle2,
  Crown,
  LockKeyhole,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

type RoleFilter = 'all' | 'household' | 'collector' | 'recycler' | 'authority' | 'superuser';

type PasswordDialogState = {
  open: boolean;
  user: BackendUser | null;
  password: string;
  confirmPassword: string;
};

type DeleteDialogState = {
  open: boolean;
  user: BackendUser | null;
};

const validatePasswordRules = (password: string) => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  return {
    hasMinLength,
    hasUppercase,
    hasSymbol,
    isValid: hasMinLength && hasUppercase && hasSymbol,
  };
};

const getUserRoleLabel = (user: BackendUser) =>
  user.is_superuser ? 'Superuser' : user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1);

const getUserRoleKey = (user: BackendUser) => (user.is_superuser ? 'superuser' : user.user_type);

export default function SuperuserUsersPage() {
  const { user, isLoading } = useAuth();
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState<PasswordDialogState>({
    open: false,
    user: null,
    password: '',
    confirmPassword: '',
  });
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    user: null,
  });

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      try {
        const rows = await listUsers();
        if (active) {
          setUsers(rows);
        }
      } catch {
        if (active) {
          setUsers([]);
          toast.error('Failed to load user records');
        }
      } finally {
        if (active) {
          setIsLoadingUsers(false);
        }
      }
    };

    loadUsers();

    return () => {
      active = false;
    };
  }, []);

  const activeUsers = useMemo(() => users.filter((item) => item.is_active), [users]);
  const superuserCount = useMemo(() => users.filter((item) => item.is_superuser).length, [users]);
  const authorityCount = useMemo(() => users.filter((item) => item.user_type === 'authority' && !item.is_superuser).length, [users]);
  const inactiveCount = users.length - activeUsers.length;

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return users.filter((item) => {
      const roleKey = getUserRoleKey(item);
      const matchesRole = roleFilter === 'all' || roleKey === roleFilter;
      const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.username;
      const haystack = [
        fullName,
        item.username,
        item.email,
        item.phone,
        item.location,
        item.county,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);

      return matchesRole && matchesSearch;
    });
  }, [roleFilter, searchQuery, users]);

  if (isLoading || !user) return null;

  const openPasswordDialog = (selectedUser: BackendUser) => {
    setPasswordDialog({
      open: true,
      user: selectedUser,
      password: '',
      confirmPassword: '',
    });
  };

  const closePasswordDialog = () => {
    setPasswordDialog({
      open: false,
      user: null,
      password: '',
      confirmPassword: '',
    });
  };

  const openDeleteDialog = (selectedUser: BackendUser) => {
    setDeleteDialog({
      open: true,
      user: selectedUser,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      open: false,
      user: null,
    });
  };

  const handleSavePassword = async () => {
    if (!passwordDialog.user) return;

    const validation = validatePasswordRules(passwordDialog.password);
    if (!validation.isValid) {
      toast.error('Password must be at least 8 characters long, with an uppercase letter and a symbol.');
      return;
    }

    if (passwordDialog.password !== passwordDialog.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    try {
      setIsSaving(true);
      await updateUserPasswordApi(passwordDialog.user.id, {
        password: passwordDialog.password,
        password2: passwordDialog.confirmPassword,
      });
      closePasswordDialog();
      toast.success('Password updated successfully.');
    } catch (error: any) {
      const payload = error?.response?.data || {};
      const message =
        payload?.password?.[0] ||
        payload?.detail ||
        error?.message ||
        'Failed to update the password.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog.user) return;

    const target = deleteDialog.user;
    if (String(target.id) === String(user.id)) {
      toast.error('You cannot delete your own account.');
      closeDeleteDialog();
      return;
    }

    if (target.is_superuser && superuserCount < 2) {
      toast.error('At least one superuser account must remain.');
      closeDeleteDialog();
      return;
    }

    try {
      setIsSaving(true);
      await deleteUserApi(target.id);
      setUsers((current) => current.filter((item) => String(item.id) !== String(target.id)));
      closeDeleteDialog();
      toast.success('User deleted successfully.');
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.message || 'Failed to delete the user.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPasswordValidation = validatePasswordRules(passwordDialog.password);
  const deleteTarget = deleteDialog.user;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              <Crown className="h-3.5 w-3.5" />
              Superuser user management
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Manage active users, reset passwords, and remove stale accounts from a focused admin console.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Users"
            value={users.length}
            icon={Users}
            description="All registered accounts"
            iconClassName="bg-primary/20 text-primary"
          />
          <StatCard
            title="Active Accounts"
            value={activeUsers.length}
            icon={CheckCircle2}
            description={`${inactiveCount} inactive accounts`}
            iconClassName="bg-success/20 text-success"
          />
          <StatCard
            title="Superusers"
            value={superuserCount}
            icon={Crown}
            description="Protected admin accounts"
            iconClassName="bg-accent/20 text-accent"
          />
          <StatCard
            title="Authority Users"
            value={authorityCount}
            icon={ShieldCheck}
            description="Non-superuser authority accounts"
            iconClassName="bg-info/20 text-info"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              User Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, phone, or county"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-10"
                />
              </div>

              <div>
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="household">Residents</SelectItem>
                    <SelectItem value="collector">Collectors</SelectItem>
                    <SelectItem value="recycler">Recyclers</SelectItem>
                    <SelectItem value="authority">Authority</SelectItem>
                    <SelectItem value="superuser">Superusers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
                    <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">Role</th>
                    <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">County / Location</th>
                    <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingUsers ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-10 text-center text-sm text-muted-foreground">
                        Loading user records...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-10 text-center text-sm text-muted-foreground">
                        No users match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((item) => {
                      const roleKey = getUserRoleKey(item);
                      const canDelete = String(item.id) !== String(user.id) && (!item.is_superuser || superuserCount > 1);

                      return (
                        <tr key={item.id} className="border-b border-border/50">
                          <td className="px-2 py-4">
                            <div className="space-y-1">
                              <p className="font-medium">
                                {`${item.first_name || ''} ${item.last_name || ''}`.trim() || item.username}
                              </p>
                              <p className="text-xs text-muted-foreground">{item.email}</p>
                              <p className="text-xs text-muted-foreground">{item.phone || 'No phone provided'}</p>
                            </div>
                          </td>
                          <td className="px-2 py-4">
                            <Badge
                              className={
                                roleKey === 'superuser'
                                  ? 'bg-warning/20 text-warning-foreground'
                                  : roleKey === 'authority'
                                  ? 'bg-accent/20 text-accent'
                                  : roleKey === 'collector'
                                  ? 'bg-info/20 text-info'
                                  : roleKey === 'recycler'
                                  ? 'bg-success/20 text-success'
                                  : 'bg-primary/20 text-primary'
                              }
                            >
                              {getUserRoleLabel(item)}
                            </Badge>
                          </td>
                          <td className="px-2 py-4">
                            <Badge variant={item.is_active ? 'secondary' : 'destructive'}>
                              {item.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-2 py-4 text-sm text-muted-foreground">
                            {item.county || item.location || 'No county or location set'}
                          </td>
                          <td className="px-2 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() => openPasswordDialog(item)}
                              >
                                <LockKeyhole className="h-4 w-4" />
                                Reset Password
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="gap-2"
                                onClick={() => openDeleteDialog(item)}
                                disabled={!canDelete}
                                title={
                                  item.id === user.id
                                    ? 'You cannot delete your own account.'
                                    : item.is_superuser && superuserCount < 2
                                    ? 'At least one superuser account must remain.'
                                    : undefined
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={passwordDialog.open} onOpenChange={(open) => { if (!open) closePasswordDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset user password</DialogTitle>
            <DialogDescription>
              {passwordDialog.user
                ? `Set a new password for ${passwordDialog.user.email}.`
                : 'Choose a new password for this account.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordDialog.password}
                onChange={(event) =>
                  setPasswordDialog((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder="Enter a new password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordDialog.confirmPassword}
                onChange={(event) =>
                  setPasswordDialog((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                placeholder="Confirm the new password"
              />
            </div>

            <div className="rounded-2xl bg-secondary/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Password requirements</p>
              <ul className="mt-2 space-y-1">
                <li className={selectedPasswordValidation.hasMinLength ? 'text-success' : ''}>Minimum 8 characters</li>
                <li className={selectedPasswordValidation.hasUppercase ? 'text-success' : ''}>At least one uppercase letter</li>
                <li className={selectedPasswordValidation.hasSymbol ? 'text-success' : ''}>At least one symbol</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePasswordDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePassword}
              disabled={
                isSaving ||
                !selectedPasswordValidation.isValid ||
                passwordDialog.password !== passwordDialog.confirmPassword
              }
            >
              {isSaving ? 'Saving...' : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently delete ${deleteTarget.email} and their profile data where applicable.`
                : 'This will permanently delete the selected user account.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteUser();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isSaving}
            >
              {isSaving ? 'Deleting...' : 'Delete account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

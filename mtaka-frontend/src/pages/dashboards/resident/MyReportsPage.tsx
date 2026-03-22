import { useCallback, useEffect, useState } from 'react';
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
  DumpingReport
} from '@/lib/store';
import { deleteDumpingReportDb, fetchDumpingReportsDb, updateDumpingReportDb } from '@/lib/dumpingReportsDb';
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  XCircle, 
  MapPin, 
  Calendar,
  Edit,
  Trash2,
  Eye,
  Search
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function MyReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<DumpingReport[]>([]);
  const [editDialog, setEditDialog] = useState<{ open: boolean; report: DumpingReport | null }>({
    open: false,
    report: null,
  });
  const [viewDialog, setViewDialog] = useState<{ open: boolean; report: DumpingReport | null }>({
    open: false,
    report: null,
  });
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; reportId: string }>({
    open: false,
    reportId: '',
  });
  const [editForm, setEditForm] = useState({
    location: '',
    description: '',
  });
  const [cancelReason, setCancelReason] = useState('');

  const refreshReports = useCallback(async () => {
    if (!user) {
      setReports([]);
      return;
    }
    const rows = await fetchDumpingReportsDb();
    setReports(rows.filter((r) => String(r.userId) === String(user.id)));
  }, [user]);

  useEffect(() => {
    refreshReports().catch(() => {
      toast.error('Failed to load reports');
    });
  }, [refreshReports]);

  if (!user) return null;

  const activeReports = reports.filter(r => 
    r.status === 'reported' || r.status === 'investigating'
  );
  const resolvedReports = reports.filter(r => r.status === 'resolved');
  const cancelledReports = reports.filter(r => r.status === 'cancelled');

  const handleEdit = (report: DumpingReport) => {
    setEditForm({
      location: report.location,
      description: report.description,
    });
    setEditDialog({ open: true, report });
  };

  const handleSaveEdit = async () => {
    if (!editDialog.report) return;
    
    await updateDumpingReportDb(editDialog.report.id, {
      location: editForm.location,
      description: editForm.description,
    });
    
    toast.success('Report updated');
    setEditDialog({ open: false, report: null });
    await refreshReports();
  };

  const handleCancel = async () => {
    await updateDumpingReportDb(cancelDialog.reportId, {
      status: 'cancelled',
      cancelReason,
    });
    
    toast.success('Report cancelled');
    setCancelDialog({ open: false, reportId: '' });
    setCancelReason('');
    await refreshReports();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this report?')) {
      await deleteDumpingReportDb(id);
      toast.success('Report deleted');
      await refreshReports();
    }
  };

  const getStatusBadge = (status: DumpingReport['status']) => {
    switch (status) {
      case 'reported':
        return <Badge className="bg-warning/20 text-warning-foreground">Reported</Badge>;
      case 'investigating':
        return <Badge className="bg-info/20 text-info">Investigating</Badge>;
      case 'resolved':
        return <Badge className="bg-success/20 text-success">Resolved</Badge>;
      case 'cancelled':
        return <Badge className="bg-muted text-muted-foreground">Cancelled</Badge>;
    }
  };

  const ReportCard = ({ report, showActions = true }: { report: DumpingReport; showActions?: boolean }) => (
    <div className="p-4 rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {getStatusBadge(report.status)}
          </div>
          
          <p className="text-sm mb-2">{report.description}</p>
          
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span className="break-words">{report.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date(report.createdAt).toLocaleDateString()}
            </div>
          </div>

          {/* Resolution notes */}
          {report.status === 'resolved' && report.resolutionNotes && (
            <div className="mt-3 p-3 rounded-lg bg-success/10">
              <p className="text-sm text-success">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                {report.resolutionNotes}
              </p>
            </div>
          )}

          {/* Cancellation reason */}
          {report.status === 'cancelled' && report.cancelReason && (
            <div className="mt-3 p-3 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                Cancelled: {report.cancelReason}
              </p>
            </div>
          )}
        </div>

        {showActions && (
          <div className="flex w-full flex-row flex-wrap gap-2 sm:w-auto sm:flex-col">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 sm:flex-none"
              onClick={() => setViewDialog({ open: true, report })}
            >
              <Eye className="w-4 h-4" />
            </Button>
            {report.status === 'reported' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleEdit(report)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 text-destructive sm:flex-none"
                  onClick={() => setCancelDialog({ open: true, reportId: report.id })}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </>
            )}
            {report.status === 'cancelled' && (
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-destructive sm:flex-none"
                onClick={() => handleDelete(report.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Dumping Reports</h1>
            <p className="text-muted-foreground">Track your illegal dumping reports</p>
          </div>
          <Link to="/waste/report">
            <Button className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              Report New Issue
            </Button>
          </Link>
        </div>

        {/* Active Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Active Reports ({activeReports.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeReports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No active reports</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeReports.map((report) => (
                  <ReportCard key={report.id} report={report} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resolved Reports */}
        {resolvedReports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                Resolved ({resolvedReports.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {resolvedReports.map((report) => (
                  <ReportCard key={report.id} report={report} showActions={false} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cancelled Reports */}
        {cancelledReports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-muted-foreground" />
                Cancelled ({cancelledReports.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cancelledReports.map((report) => (
                  <ReportCard key={report.id} report={report} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, report: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, report: null })}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ open, reportId: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-muted-foreground">
              Are you sure you want to cancel this report?
            </p>
            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Textarea
                placeholder="Why are you cancelling this report?"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog({ open: false, reportId: '' })}>
              Keep Report
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog({ open, report: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Details</DialogTitle>
          </DialogHeader>
          {viewDialog.report && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(viewDialog.report.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date Reported</p>
                  <p className="font-medium">{new Date(viewDialog.report.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">{viewDialog.report.location}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p>{viewDialog.report.description}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Coordinates</p>
                <p className="text-sm">
                  {viewDialog.report.coordinates.lat.toFixed(4)}, {viewDialog.report.coordinates.lng.toFixed(4)}
                </p>
              </div>
              {viewDialog.report.resolutionNotes && (
                <div className="p-3 rounded-lg bg-success/10">
                  <p className="text-sm text-muted-foreground">Resolution</p>
                  <p className="text-success">{viewDialog.report.resolutionNotes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type CollectorUpdate,
  type WasteRequest,
} from '@/lib/store';
import {
  createCollectionUpdateDb,
  fetchCollectorTransactionsDb,
  fetchCollectionUpdatesDb,
  fetchCurrentUserCollectionRequests,
  type CollectorTransaction,
  updateWasteRequestDb,
} from '@/lib/collectionRequestsApi';
import { useAuth } from '@/hooks/useAuth';
import { Truck, MapPin, Clock, CheckCircle, XCircle, Package, MessageSquare, Phone, Send, Search, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';

const wasteTypeIcons: Record<string, string> = {
  organic: 'organic',
  recyclable: 'recyclable',
  hazardous: 'hazardous',
  general: 'general',
};

export default function RequestsPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<WasteRequest[]>([]);
  const [transactions, setTransactions] = useState<CollectorTransaction[]>([]);
  const [updatesByRequest, setUpdatesByRequest] = useState<Record<string, CollectorUpdate[]>>({});
  const [updateDialog, setUpdateDialog] = useState<{ open: boolean; request: WasteRequest | null; type: 'decline' | 'message' }>({
    open: false, request: null, type: 'message',
  });
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; transaction: CollectorTransaction | null }>({
    open: false, transaction: null,
  });
  const [updateForm, setUpdateForm] = useState({ message: '', declineReason: '' });
  const [searchName, setSearchName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!user) return;
    void refreshRequests(true);
    const timer = globalThis.setInterval(() => {
      void refreshRequests(false);
    }, 15000);
    const onFocus = () => {
      void refreshRequests(true);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      globalThis.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  const pendingRequests = requests.filter((item) => item.status === 'pending');
  const assignedRequests = requests.filter((item) => item.status === 'accepted');
  const today = new Date().toISOString().split('T')[0];
  const completedToday = transactions.filter((item) => item.createdAt.split('T')[0] === today);
  const filteredCompleted = showSearch
    ? transactions.filter((item) => {
        const completedDate = item.createdAt.split('T')[0];
        const nameMatch = searchName
          ? item.residentName.toLowerCase().includes(searchName.toLowerCase())
          : true;
        const fromMatch = dateFrom ? completedDate >= dateFrom : true;
        const toMatch = dateTo ? completedDate <= dateTo : true;
        return nameMatch && fromMatch && toMatch;
      })
    : completedToday;

  const groupUpdatesByRequest = (updates: CollectorUpdate[]) =>
    updates.reduce<Record<string, CollectorUpdate[]>>((grouped, update) => {
      if (!grouped[update.requestId]) {
        grouped[update.requestId] = [];
      }
      grouped[update.requestId].push(update);
      return grouped;
    }, {});

  const refreshRequests = async (force = false) => {
    try {
      const [requestRows, transactionRows, updateRows] = await Promise.all([
        fetchCurrentUserCollectionRequests(force),
        fetchCollectorTransactionsDb(force),
        fetchCollectionUpdatesDb(undefined, force),
      ]);
      setRequests(requestRows);
      setTransactions(transactionRows);
      setUpdatesByRequest(groupUpdatesByRequest(updateRows));
    } catch {
      setRequests([]);
      setTransactions([]);
      setUpdatesByRequest({});
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading requests...</p>
      </div>
    );
  }

  if (!user) return null;

  const handleAccept = async (request: WasteRequest) => {
    setRequests((prev) =>
      prev.map((item) =>
        item.id === request.id
          ? { ...item, status: 'accepted', collectorId: user.id, collectorName: user.name }
          : item
      )
    );
    try {
      await updateWasteRequestDb(request.id, { status: 'accepted', collectorId: user.id, collectorName: user.name });
      toast.success('Pickup request accepted');
      await refreshRequests(true);
    } catch {
      toast.error('Failed to accept pickup request');
      await refreshRequests(true);
    }
  };

  const closeUpdateDialog = () => {
    setUpdateDialog({ open: false, request: null, type: 'message' });
    setUpdateForm({ message: '', declineReason: '' });
  };

  const handleDecline = async () => {
    if (!updateDialog.request) return;
    const declineReason = updateForm.declineReason.trim();
    if (!declineReason) {
      toast.error('Enter a reason for declining this request');
      return;
    }
    const declinedRequestId = updateDialog.request.id;
    try {
      await updateWasteRequestDb(declinedRequestId, { status: 'declined', declineReason });
      await createCollectionUpdateDb({
        requestId: updateDialog.request.id,
        type: 'declined',
        message: declineReason,
      });
      toast.info('Request declined');
      closeUpdateDialog();
      await refreshRequests(true);
    } catch {
      toast.error('Failed to decline request');
    }
  };

  const handleSendUpdate = async () => {
    if (!updateDialog.request) return;
    const message = updateForm.message.trim();
    if (!message) {
      toast.error('Enter a message before sending');
      return;
    }

    try {
      await createCollectionUpdateDb({
        requestId: updateDialog.request.id,
        type: 'message',
        message,
      });
      toast.success('Message sent to resident');
      closeUpdateDialog();
      await refreshRequests(true);
    } catch {
      toast.error('Failed to send message');
    }
  };

  const openUpdateDialog = (request: WasteRequest, type: 'decline' | 'message') => {
    setUpdateForm({ message: '', declineReason: '' });
    setUpdateDialog({ open: true, request, type });
  };

  const getResidentPhone = (request: WasteRequest) => request.userPhone || '';

  const handleDownloadReport = () => {
    const csvContent = [
      'Date Completed,Pickup Date,Pickup Time,Resident,Location,Weight (kg),Amount (KES),Payment Method',
      ...filteredCompleted.map((item) =>
        `${new Date(item.createdAt).toLocaleString()},${item.collectionDate},${item.collectionTime},${item.residentName},${item.location},${item.totalWeight},${item.totalPrice},${item.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}`
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `completed-pickups-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pickup Requests</h1>
          <p className="text-muted-foreground">Accept pickup requests and finalize payments from the Transactions page</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Available Requests ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRequests.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No pending requests in your area</p>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="p-4 rounded-lg border border-border bg-card">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm uppercase tracking-wide text-muted-foreground">{wasteTypeIcons[request.wasteType]}</span>
                          <span className="font-semibold capitalize">{request.wasteType} Waste</span>
                          <Badge variant="outline">Pending</Badge>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2"><MapPin className="w-4 h-4" />{request.location}</div>
                          <div className="flex items-center gap-2"><Clock className="w-4 h-4" />{request.date} at {request.time}</div>
                          <div>Resident: {request.userName}</div>
                        </div>
                        {request.notes && <p className="text-sm mt-2 p-2 bg-secondary/50 rounded">{request.notes}</p>}
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        <Button size="sm" className="w-full sm:w-auto" onClick={() => handleAccept(request)}>
                          <CheckCircle className="w-4 h-4 mr-1" />Accept
                        </Button>
                        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => openUpdateDialog(request, 'decline')}>
                          <XCircle className="w-4 h-4 mr-1" />Decline
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              My Assigned Pickups ({assignedRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedRequests.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No assigned pickups</p>
            ) : (
              <div className="space-y-4">
                {assignedRequests.map((request) => {
                  const phone = getResidentPhone(request);
                  const updates = updatesByRequest[request.id] || [];
                  return (
                    <div key={request.id} className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm uppercase tracking-wide text-muted-foreground">{wasteTypeIcons[request.wasteType]}</span>
                            <span className="font-semibold capitalize">{request.wasteType} Waste</span>
                            <Badge className="bg-primary">Accepted</Badge>
                          </div>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2"><MapPin className="w-4 h-4" />{request.location}</div>
                            <div className="flex items-center gap-2"><Clock className="w-4 h-4" />{request.date} at {request.time}</div>
                            <div>Resident: {request.userName}</div>
                            {phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4" />
                                <a href={`tel:${phone}`} className="text-primary underline hover:text-primary/80">{phone}</a>
                              </div>
                            )}
                          </div>
                          {request.notes && <p className="text-sm mt-2 p-2 bg-secondary/50 rounded">{request.notes}</p>}
                          {updates.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {updates.map((update) => (
                                <div key={update.id} className={`p-3 rounded-lg text-sm ${update.type === 'resident_reply' ? 'bg-info/10 border border-info/20' : 'bg-secondary/50'}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {update.type === 'resident_reply' ? <Send className="w-3 h-3 text-info" /> : <MessageSquare className="w-3 h-3" />}
                                    <span className="font-medium text-xs">
                                      {update.type === 'resident_reply' ? `Reply from ${update.residentName || 'Resident'}` : 'Your message'}
                                    </span>
                                  </div>
                                  <p className="text-muted-foreground">{update.message}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto">
                          <Button className="w-full sm:w-auto" onClick={() => navigate(`/dashboard/collector/transactions?request=${request.id}`)}>
                            <CheckCircle className="w-4 h-4 mr-1" />Complete pick
                          </Button>
                          <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={() => openUpdateDialog(request, 'message')}>
                            <MessageSquare className="w-4 h-4 mr-1" />Message
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="space-y-3">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                {showSearch ? 'Completed Pickups (Filtered)' : 'Completed Today'} ({filteredCompleted.length})
              </CardTitle>
              <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex w-max items-center gap-2">
                  <Button
                    className="shrink-0 whitespace-nowrap"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSearch(!showSearch)}
                  >
                    <Search className="w-4 h-4 mr-1" />
                    {showSearch ? 'Hide Search' : 'Search by Date'}
                  </Button>
                  {filteredCompleted.length > 0 && (
                    <Button className="shrink-0 whitespace-nowrap" variant="outline" size="sm" onClick={handleDownloadReport}>
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {showSearch && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Resident Name</Label>
                  <Input
                    placeholder="Search by resident..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full" />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full self-end sm:w-auto"
                  onClick={() => {
                    setSearchName('');
                    setDateFrom('');
                    setDateTo('');
                    setShowSearch(false);
                  }}
                >
                  Clear
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {filteredCompleted.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {showSearch ? 'No pickups found with the selected filters' : 'No pickups completed today'}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredCompleted.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{item.residentName}</p>
                      <p className="text-sm text-muted-foreground">{item.location}</p>
                      <p className="text-xs text-muted-foreground">
                        Date Completed: {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setPreviewDialog({ open: true, transaction: item })}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <div className="text-right">
                        <p className="text-sm font-medium">{item.totalWeight} kg</p>
                        <p className="text-xs text-muted-foreground">KES {item.totalPrice.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={updateDialog.open} onOpenChange={(open) => {
        if (!open) {
          closeUpdateDialog();
          return;
        }
        setUpdateDialog((prev) => ({ ...prev, open }));
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {updateDialog.type === 'decline' ? 'Decline Request' : 'Send Message'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {updateDialog.type === 'decline' ? (
              <div className="space-y-2">
                <Label>Reason for declining</Label>
                <Textarea
                  placeholder="Explain why you can't accept this request..."
                  value={updateForm.declineReason}
                  onChange={(e) => setUpdateForm({ ...updateForm, declineReason: e.target.value })}
                  required
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  placeholder="Send a message to the resident..."
                  value={updateForm.message}
                  onChange={(e) => setUpdateForm({ ...updateForm, message: e.target.value })}
                  required
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUpdateDialog}>Cancel</Button>
            {updateDialog.type === 'decline' ? (
              <Button variant="destructive" onClick={handleDecline}>Decline Request</Button>
            ) : (
              <Button onClick={handleSendUpdate}>Send Update</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialog.open} onOpenChange={(open) => setPreviewDialog({ open, transaction: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pickup Preview</DialogTitle>
          </DialogHeader>
          {previewDialog.transaction && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Resident</p>
                  <p className="font-medium">{previewDialog.transaction.residentName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pickup Date</p>
                  <p className="font-medium">{previewDialog.transaction.collectionDate}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pickup Time</p>
                  <p className="font-medium">{previewDialog.transaction.collectionTime}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date Completed</p>
                  <p className="font-medium">{new Date(previewDialog.transaction.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="font-medium">{previewDialog.transaction.totalWeight} kg</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium">KES {previewDialog.transaction.totalPrice.toLocaleString()}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">{previewDialog.transaction.location}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

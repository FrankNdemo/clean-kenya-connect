import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import type { WasteRequest } from '@/lib/store';
import { getApiErrorMessage } from '@/api';
import {
  createCollectorTransactionDb,
  fetchCollectorTransactionsDb,
  fetchCurrentUserCollectionRequests,
  initiateCollectorMpesaPaymentDb,
  saveCollectorMpesaPaymentCompletionNotesDb,
  waitForCollectorMpesaPaymentDb,
  type CollectorTransaction,
} from '@/lib/collectionRequestsApi';
import { Download, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function CollectorTransactionsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<WasteRequest[]>([]);
  const [transactions, setTransactions] = useState<CollectorTransaction[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState(searchParams.get('request') || '');
  const [totalWeight, setTotalWeight] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const [useOtherPhone, setUseOtherPhone] = useState(false);
  const [otherPhoneNumber, setOtherPhoneNumber] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [paymentStatusText, setPaymentStatusText] = useState('');
  const [mpesaPaymentId, setMpesaPaymentId] = useState('');
  const [isMpesaPaymentConfirmed, setIsMpesaPaymentConfirmed] = useState(false);
  const [pendingCollectorTransaction, setPendingCollectorTransaction] = useState<CollectorTransaction | null>(null);
  const [newTransactionOpen, setNewTransactionOpen] = useState(Boolean(searchParams.get('request')));
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    if (!user) return;
    void refreshData(true);
    const timer = window.setInterval(() => {
      void refreshData(false);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const requestId = searchParams.get('request') || '';
    if (requestId) {
      setSelectedRequestId(requestId);
      setNewTransactionOpen(true);
    }
  }, [searchParams]);

  const refreshData = async (force = false) => {
    try {
      const [requestRows, transactionRows] = await Promise.all([
        fetchCurrentUserCollectionRequests(force),
        fetchCollectorTransactionsDb(force),
      ]);
      setRequests(requestRows);
      setTransactions(transactionRows);
    } catch {
      setRequests([]);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading transactions...</p>
      </div>
    );
  }

  if (!user) return null;

  const transactedRequestIds = new Set(transactions.map((item) => item.collectionRequestId));
  const eligibleRequests = requests.filter((item) => item.status === 'accepted' && !transactedRequestIds.has(item.id));

  const filteredTransactions = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [transactions]
  );
  const visibleTransactions = useMemo(
    () => filteredTransactions.slice(0, visibleCount),
    [filteredTransactions, visibleCount]
  );

  const selectedRequest = eligibleRequests.find((item) => item.id === selectedRequestId);
  const residentPhoneNumber = (selectedRequest?.userPhone || '').trim();
  const effectiveMpesaPhone = (useOtherPhone ? otherPhoneNumber : residentPhoneNumber).trim();
  const displayAmount = Number(totalPrice);
  const showCompletionNotes = paymentMethod === 'cash' || isMpesaPaymentConfirmed;

  const resetForm = () => {
    setTotalWeight('');
    setTotalPrice('');
    setPaymentMethod('cash');
    setUseOtherPhone(false);
    setOtherPhoneNumber('');
    setCompletionNotes('');
    setPaymentStatusText('');
    setMpesaPaymentId('');
    setIsMpesaPaymentConfirmed(false);
    setPendingCollectorTransaction(null);
    setSelectedRequestId('');
  };

  const handleCreateTransaction = async () => {
    if (!selectedRequestId) {
      toast.error('Select a pickup request first');
      return;
    }
    const weightValue = Number(totalWeight);
    const priceValue = Number(totalPrice);

    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      toast.error('Enter a valid total weight');
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      toast.error('Enter a valid agreed price');
      return;
    }
    if (paymentMethod === 'mpesa' && !isMpesaPaymentConfirmed && !effectiveMpesaPhone) {
      toast.error(useOtherPhone ? 'Enter the M-Pesa number to charge' : 'Resident phone number is missing. Use another number instead.');
      return;
    }

    setIsSubmitting(true);
    setPaymentStatusText('');
    try {
      let createdTransaction: CollectorTransaction | undefined;

      if (paymentMethod === 'cash') {
        createdTransaction = await createCollectorTransactionDb({
          collectionRequestId: selectedRequestId,
          totalWeight: weightValue,
          totalPrice: priceValue,
          paymentMethod,
          completionNotes,
        });
        toast.success('Transaction saved and pickup completed');
      } else {
        if (isMpesaPaymentConfirmed && mpesaPaymentId) {
          await saveCollectorMpesaPaymentCompletionNotesDb(mpesaPaymentId, completionNotes);
          createdTransaction = pendingCollectorTransaction || undefined;
          toast.success('Pickup finished successfully');
        } else {
          const payment = await initiateCollectorMpesaPaymentDb({
            collectionRequestId: selectedRequestId,
            totalWeight: weightValue,
            totalPrice: priceValue,
            phoneNumber: effectiveMpesaPhone,
          });

          setPaymentStatusText(
            payment.customerMessage || `STK push sent to ${payment.phoneNumberMasked || payment.phoneNumber}. Waiting for approval...`
          );
          toast.success(payment.customerMessage || 'M-Pesa prompt sent to the payer phone');

          const settledPayment = await waitForCollectorMpesaPaymentDb(payment.id, {
            pollMs: 4000,
            maxAttempts: 30,
            onUpdate: (nextPayment) => {
              if (nextPayment.status === 'pending') {
                setPaymentStatusText(
                  nextPayment.customerMessage ||
                    `Waiting for payment approval on ${nextPayment.phoneNumberMasked || nextPayment.phoneNumber}...`
                );
              }
            },
          });

          if (settledPayment.status === 'success' && settledPayment.collectorTransaction) {
            setMpesaPaymentId(settledPayment.id);
            setIsMpesaPaymentConfirmed(true);
            setPendingCollectorTransaction(settledPayment.collectorTransaction);
            setPaymentStatusText(
              settledPayment.mpesaReceiptNumber
                ? `Payment confirmed. Receipt ${settledPayment.mpesaReceiptNumber} recorded. You can now add optional completion notes and finish pickup.`
                : 'Payment confirmed. You can now add optional completion notes and finish pickup.'
            );
            toast.success(
              settledPayment.mpesaReceiptNumber
                ? `Payment confirmed. Receipt ${settledPayment.mpesaReceiptNumber}`
                : 'Payment confirmed. Finish the pickup to close the dialog.'
            );
            return;
          } else if (settledPayment.status === 'pending') {
            toast('Payment request is still pending. Keep the page open or refresh shortly.');
            setPaymentStatusText('Payment request is still pending.');
            return;
          } else {
            const failureMessage =
              settledPayment.resultDesc || settledPayment.responseDescription || 'M-Pesa payment was not completed.';
            setPaymentStatusText(failureMessage);
            toast.error(failureMessage);
            return;
          }
        }
      }

      if (!createdTransaction) {
        void refreshData(true);
      }

      if (createdTransaction) {
        setTransactions((prev) =>
          prev.some((item) => item.id === createdTransaction?.id) ? prev : [createdTransaction, ...prev]
        );
      }
      setRequests((prev) =>
        prev.map((request) =>
          request.id === selectedRequestId ? { ...request, status: 'completed' } : request
        )
      );
      resetForm();
      setNewTransactionOpen(false);
      setSearchParams({});
      void refreshData(true);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Failed to save transaction');
      setPaymentStatusText(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    const csvContent = [
      'Date,Resident,Location,Weight (kg),Amount (KES),Payment Method,M-Pesa Code',
      ...filteredTransactions.map((item) =>
        `${new Date(item.createdAt).toLocaleDateString()},${item.residentName},${item.location},${item.totalWeight},${item.totalPrice},${item.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'},${item.mpesaCode || ''}`
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collector-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Transactions exported');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Transactions</h1>
            <p className="text-muted-foreground">Finalize pickups and record payment details</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setNewTransactionOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />New Transaction
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Recent Transactions
              </CardTitle>
              {filteredTransactions.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-1" />Export
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded bg-secondary/60" />
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No transactions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Date</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Resident</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Location</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Weight</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Payment</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTransactions.map((item) => (
                      <tr key={item.id} className="border-b border-border/50">
                        <td className="py-3 px-2 text-sm">{new Date(item.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-2 text-sm">{item.residentName}</td>
                        <td className="py-3 px-2 text-sm">{item.location}</td>
                        <td className="py-3 px-2 text-sm">{item.totalWeight} kg</td>
                        <td className="py-3 px-2">
                          <div className="flex flex-col gap-1">
                            <Badge variant={item.paymentMethod === 'mpesa' ? 'default' : 'secondary'}>
                              {item.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}
                            </Badge>
                            {item.paymentMethod === 'mpesa' && item.mpesaCode && (
                              <span className="text-xs text-muted-foreground">{item.mpesaCode}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-sm font-medium">KES {item.totalPrice.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!isLoading && filteredTransactions.length > visibleCount && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + 20)}>
                  Load More
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={newTransactionOpen}
        onOpenChange={(open) => {
          setNewTransactionOpen(open);
          if (!open) {
            resetForm();
            setSearchParams({});
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Pickup Request</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
                disabled={isSubmitting || isMpesaPaymentConfirmed}
              >
                <option value="">Select assigned pickup</option>
                {eligibleRequests.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.userName} - {item.location} ({item.date} {item.time})
                  </option>
                ))}
              </select>
              {selectedRequest && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedRequest.userName} - {selectedRequest.location}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Weight Collected (kg)</Label>
                <Input type="number" min="0" step="0.01" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} placeholder="e.g. 45.5" disabled={isSubmitting || isMpesaPaymentConfirmed} />
              </div>
              <div className="space-y-2">
                <Label>Total Agreed Price (KES)</Label>
                <Input type="number" min="0" step="0.01" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} placeholder="e.g. 3500" disabled={isSubmitting || isMpesaPaymentConfirmed} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={paymentMethod}
                onChange={(e) => {
                  const nextMethod = e.target.value as 'cash' | 'mpesa';
                  setPaymentMethod(nextMethod);
                  if (nextMethod === 'cash') {
                    setUseOtherPhone(false);
                    setOtherPhoneNumber('');
                    setPaymentStatusText('');
                    setMpesaPaymentId('');
                    setIsMpesaPaymentConfirmed(false);
                    setPendingCollectorTransaction(null);
                  }
                }}
                disabled={isSubmitting || isMpesaPaymentConfirmed}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
              </select>
            </div>
            {paymentMethod === 'mpesa' && (
              <div className="space-y-4 rounded-lg border border-primary/15 bg-primary/5 p-4">
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">
                    STK push amount: KES {Number.isFinite(displayAmount) && displayAmount > 0 ? displayAmount.toLocaleString() : '0'}
                  </p>
                  <p className="text-muted-foreground">
                    The resident phone is selected automatically. Enable the option below if you want to charge another M-Pesa number.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Resident Phone</Label>
                  <Input
                    value={residentPhoneNumber || 'No resident phone available'}
                    readOnly
                    disabled={!residentPhoneNumber}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="collector-other-phone"
                    checked={useOtherPhone}
                    onCheckedChange={(checked) => {
                      const nextValue = checked === true;
                      setUseOtherPhone(nextValue);
                      setPaymentStatusText('');
                      if (!nextValue) {
                        setOtherPhoneNumber('');
                      }
                    }}
                  />
                  <Label htmlFor="collector-other-phone">Use another M-Pesa number</Label>
                </div>
                {useOtherPhone && (
                  <div className="space-y-2">
                    <Label>Other M-Pesa Number</Label>
                    <Input
                    value={otherPhoneNumber}
                    onChange={(e) => setOtherPhoneNumber(e.target.value)}
                    placeholder="e.g. 0712345678"
                    disabled={isSubmitting || isMpesaPaymentConfirmed}
                  />
                </div>
                )}
                {paymentStatusText && (
                  <p className="text-xs text-muted-foreground">{paymentStatusText}</p>
                )}
              </div>
            )}
            {showCompletionNotes && (
            <div className="space-y-2">
              <Label>Completion Notes (Optional)</Label>
              <Input value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="Short completion note" />
            </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTransactionOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleCreateTransaction} disabled={isSubmitting}>
              {isSubmitting
                ? paymentMethod === 'mpesa'
                  ? isMpesaPaymentConfirmed
                    ? 'Finishing...'
                    : 'Waiting for Payment...'
                  : 'Saving...'
                : paymentMethod === 'mpesa'
                ? isMpesaPaymentConfirmed
                  ? 'Finish Pickup'
                  : 'Push Payment'
                : 'Save Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

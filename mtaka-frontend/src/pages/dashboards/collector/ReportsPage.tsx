import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { FileText, TrendingUp, Truck, Scale, Download, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchCollectorTransactionsDb, type CollectorTransaction } from '@/lib/collectionRequestsApi';
import { toast } from 'sonner';

type Bucket = { label: string; from: Date; to: Date };

const inRange = (dateValue: string | Date, from: Date, to: Date) => {
  const value = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return value >= from && value <= to;
};

const getWeekBucketsOfMonth = (year: number, month: number): Bucket[] => {
  const endDay = new Date(year, month + 1, 0).getDate();
  return [
    { label: 'Week 1', from: new Date(year, month, 1), to: new Date(year, month, 7, 23, 59, 59) },
    { label: 'Week 2', from: new Date(year, month, 8), to: new Date(year, month, 14, 23, 59, 59) },
    { label: 'Week 3', from: new Date(year, month, 15), to: new Date(year, month, 21, 23, 59, 59) },
    { label: 'Week 4', from: new Date(year, month, 22), to: new Date(year, month, endDay, 23, 59, 59) },
  ];
};

const getCenteredMonthBuckets = (year: number, month: number): Bucket[] =>
  Array.from({ length: 5 }, (_, index) => {
    const offset = index - 2;
    const date = new Date(year, month + offset, 1);
    return {
      label: date.toLocaleString('default', { month: 'short' }),
      from: new Date(date.getFullYear(), date.getMonth(), 1),
      to: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59),
    };
  });

const getYearMonthBuckets = (year: number): Bucket[] =>
  Array.from({ length: 12 }, (_, month) => ({
    label: new Date(year, month, 1).toLocaleString('default', { month: 'short' }),
    from: new Date(year, month, 1),
    to: new Date(year, month + 1, 0, 23, 59, 59),
  }));

const isAnnualRange = (from: Date, to: Date) =>
  from.getMonth() === 0 &&
  from.getDate() === 1 &&
  to.getMonth() === 11 &&
  to.getDate() >= 31;

export default function ReportsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<CollectorTransaction[]>([]);
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [chartDateRange, setChartDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [searchResident, setSearchResident] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const rows = await fetchCollectorTransactionsDb();
        setTransactions(rows);
      } catch {
        setTransactions([]);
      }
    })();
  }, [user]);

  if (!user) return null;

  const now = new Date();
  const effectiveRange = chartDateRange || {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };

  const baseFilteredTransactions = transactions;

  const periodTransactions = useMemo(
    () => baseFilteredTransactions.filter((item) => inRange(item.createdAt, effectiveRange.from, effectiveRange.to)),
    [baseFilteredTransactions, effectiveRange.from, effectiveRange.to]
  );

  const buckets = useMemo(() => {
    if (viewMode === 'weekly') {
      return getWeekBucketsOfMonth(effectiveRange.from.getFullYear(), effectiveRange.from.getMonth());
    }
    if (isAnnualRange(effectiveRange.from, effectiveRange.to)) {
      return getYearMonthBuckets(effectiveRange.from.getFullYear());
    }
    return getCenteredMonthBuckets(effectiveRange.from.getFullYear(), effectiveRange.from.getMonth());
  }, [effectiveRange.from, effectiveRange.to, viewMode]);

  const chartData = useMemo(
    () => buckets.map((bucket) => {
      const sourceTransactions = viewMode === 'monthly' ? baseFilteredTransactions : periodTransactions;
      const bucketTransactions = sourceTransactions.filter((item) => inRange(item.createdAt, bucket.from, bucket.to));
      return {
        label: bucket.label,
        completed: bucketTransactions.length,
        weight: bucketTransactions.reduce((sum, item) => sum + item.totalWeight, 0),
        value: bucketTransactions.reduce((sum, item) => sum + item.totalPrice, 0),
      };
    }),
    [baseFilteredTransactions, buckets, periodTransactions, viewMode]
  );

  const totalCollectionsCompleted = periodTransactions.length;
  const totalCollectionsValue = periodTransactions.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalWeightCollected = periodTransactions.reduce((sum, item) => sum + item.totalWeight, 0);
  const maxCollections = Math.max(...chartData.map((item) => item.completed), 1);

  const sortedPeriodTransactions = useMemo(
    () => [...periodTransactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [periodTransactions]
  );

  const filteredRecentCollections = useMemo(() => {
    let result = sortedPeriodTransactions;
    if (showSearch) {
      if (searchResident) {
        const normalized = searchResident.toLowerCase();
        result = result.filter((item) => `${item.residentName} ${item.location}`.toLowerCase().includes(normalized));
      }
      if (dateFrom) {
        result = result.filter((item) => item.createdAt.split('T')[0] >= dateFrom);
      }
      if (dateTo) {
        result = result.filter((item) => item.createdAt.split('T')[0] <= dateTo);
      }
    }
    return showSearch ? result : result.slice(0, 50);
  }, [sortedPeriodTransactions, searchResident, dateFrom, dateTo, showSearch]);

  const handleDateRangeChange = useCallback((from: Date, to: Date) => {
    setChartDateRange({ from, to });
  }, []);

  const handleDownload = () => {
    const csvContent = [
      'Date,Resident,Location,Weight (kg),Amount (KES),Payment Method',
      ...filteredRecentCollections.map((item) =>
        `${new Date(item.createdAt).toLocaleDateString()},${item.residentName},${item.location},${item.totalWeight},${item.totalPrice},${item.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}`
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `collector-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Collector Analytics</h1>
          <p className="text-muted-foreground">Track finalized collection transactions and export reports</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Collections Value</p>
                  <p className="text-2xl font-bold">KES {totalCollectionsValue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Collections Completed</p>
                  <p className="text-2xl font-bold">{totalCollectionsCompleted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <Scale className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Weight Collected</p>
                  <p className="text-2xl font-bold">{totalWeightCollected.toLocaleString()} kg</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle>Collections Trend</CardTitle>
                <div className="flex gap-1 bg-secondary rounded-lg p-1">
                  <Button size="sm" variant={viewMode === 'weekly' ? 'default' : 'ghost'} onClick={() => setViewMode('weekly')}>Weekly</Button>
                  <Button size="sm" variant={viewMode === 'monthly' ? 'default' : 'ghost'} onClick={() => setViewMode('monthly')}>Monthly</Button>
                </div>
              </div>
              <DateRangeFilter viewMode={viewMode} onDateRangeChange={handleDateRangeChange} />
            </div>
          </CardHeader>
          <CardContent>
            {chartData.every((item) => item.completed === 0) ? (
              <div className="text-center py-10 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No collection transactions in this filter</p>
              </div>
            ) : (
              <div className="flex items-end justify-between gap-3 h-52">
                {chartData.map((item) => (
                  <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-medium">{item.completed > 0 ? item.completed : ''}</span>
                    <div
                      className="w-full bg-gradient-to-t from-primary to-primary/60 rounded-t-lg"
                      style={{
                        height: `${(item.completed / maxCollections) * 150}px`,
                        minHeight: item.completed > 0 ? '8px' : '0',
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="space-y-3">
              <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex w-max items-center gap-2">
                  <CardTitle className="mr-2 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    My Recent Collections
                  </CardTitle>
                  <Button className="shrink-0 whitespace-nowrap" variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)}>
                    <Search className="w-4 h-4 mr-1" />{showSearch ? 'Hide' : 'Search'}
                  </Button>
                  {filteredRecentCollections.length > 0 && (
                    <Button className="shrink-0 whitespace-nowrap" variant="outline" size="sm" onClick={handleDownload}>
                      <Download className="w-4 h-4 mr-1" />Export
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {showSearch && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">Resident / Location</Label>
                  <Input placeholder="Search resident or location..." value={searchResident} onChange={(e) => setSearchResident(e.target.value)} className="w-full" />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full" />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full" />
                </div>
                <Button variant="ghost" size="sm" className="w-full self-end sm:w-auto" onClick={() => { setSearchResident(''); setDateFrom(''); setDateTo(''); }}>
                  Clear
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {filteredRecentCollections.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{showSearch ? 'No collections found with the selected filters' : 'No collection transactions found'}</p>
              </div>
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
                    {filteredRecentCollections.map((item) => (
                      <tr key={item.id} className="border-b border-border/50">
                        <td className="py-3 px-2 text-sm">{new Date(item.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-2 text-sm">{item.residentName}</td>
                        <td className="py-3 px-2 text-sm">{item.location}</td>
                        <td className="py-3 px-2 text-sm">{item.totalWeight} kg</td>
                        <td className="py-3 px-2 text-sm">{item.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}</td>
                        <td className="py-3 px-2 text-sm font-medium">KES {item.totalPrice.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

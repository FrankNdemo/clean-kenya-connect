import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { BarChart3, TrendingUp, Truck, Users, Recycle, MapPin } from 'lucide-react';
import {
  getProfile,
  listCollectionRequests,
  listDumpingReportsApi,
  listRecyclableListings,
  listRecyclerTransactionsApi,
  listUsers,
  type BackendCollectionRequest,
  type BackendDumpingReport,
  type BackendRecyclableListing,
  type BackendRecyclerTransaction,
  type BackendUser,
} from '@/api';

type TrendBucket = { label: string; from: Date; to: Date };

const getWeekBucketsOfMonth = (year: number, month: number): TrendBucket[] => {
  const endDay = new Date(year, month + 1, 0).getDate();
  return [
    { label: 'Week 1', from: new Date(year, month, 1), to: new Date(year, month, 7, 23, 59, 59) },
    { label: 'Week 2', from: new Date(year, month, 8), to: new Date(year, month, 14, 23, 59, 59) },
    { label: 'Week 3', from: new Date(year, month, 15), to: new Date(year, month, 21, 23, 59, 59) },
    { label: 'Week 4', from: new Date(year, month, 22), to: new Date(year, month, endDay, 23, 59, 59) },
  ];
};

const getCenteredMonthBuckets = (year: number, month: number): TrendBucket[] =>
  Array.from({ length: 5 }, (_, index) => {
    const offset = index - 2;
    const date = new Date(year, month + offset, 1);
    return {
      label: date.toLocaleString('default', { month: 'short' }),
      from: new Date(date.getFullYear(), date.getMonth(), 1),
      to: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59),
    };
  });

const getYearMonthBuckets = (year: number): TrendBucket[] =>
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

const inRange = (input: string | Date, from: Date, to: Date) => {
  const date = input instanceof Date ? input : new Date(input);
  return date >= from && date <= to;
};

export default function StatsPage() {
  const [trendView, setTrendView] = useState<'weekly' | 'monthly'>('weekly');
  const [trendDateRange, setTrendDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [requests, setRequests] = useState<BackendCollectionRequest[]>([]);
  const [transactions, setTransactions] = useState<BackendRecyclerTransaction[]>([]);
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [reports, setReports] = useState<BackendDumpingReport[]>([]);
  const [isNairobiAuthority, setIsNairobiAuthority] = useState(false);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      try {
        const [profileRes, requestsRes, transactionsRes, usersRes, reportsRes, listingsRes] = await Promise.all([
          getProfile(),
          listCollectionRequests(),
          listRecyclerTransactionsApi(),
          listUsers(),
          listDumpingReportsApi(),
          listRecyclableListings(),
        ]);

        if (!active) return;

        const county = String(profileRes?.profile?.county || '').toLowerCase();
        const shouldFilterToNairobi = county.includes('nairobi');
        setIsNairobiAuthority(shouldFilterToNairobi);

        if (!shouldFilterToNairobi) {
          setRequests(requestsRes);
          setTransactions(transactionsRes);
          setUsers(usersRes);
          setReports(reportsRes);
          return;
        }

        const isNairobiText = (value?: string | null) =>
          String(value || '').toLowerCase().includes('nairobi');

        const nairobiRequests = requestsRes.filter((request) => isNairobiText(request.address));
        const listingsById = new Map<number, BackendRecyclableListing>();
        listingsRes.forEach((listing) => listingsById.set(listing.id, listing));

        const nairobiTransactions = transactionsRes.filter((transaction) => {
          const listing = transaction.listing ? listingsById.get(transaction.listing) : undefined;
          if (listing) return isNairobiText(listing.resident_location);
          return isNairobiText(transaction.source);
        });

        const nairobiUserIds = new Set<number>();
        nairobiRequests.forEach((request) => {
          nairobiUserIds.add(request.household);
          if (request.collector_user_id) nairobiUserIds.add(request.collector_user_id);
        });
        listingsRes.forEach((listing) => {
          if (isNairobiText(listing.resident_location)) {
            nairobiUserIds.add(listing.resident);
            if (listing.recycler) nairobiUserIds.add(listing.recycler);
          }
        });

        setRequests(nairobiRequests);
        setTransactions(nairobiTransactions);
        setUsers(usersRes.filter((user) => nairobiUserIds.has(user.id)));
        setReports(reportsRes.filter((report) => isNairobiText(report.location)));
      } catch {
        if (!active) return;
        setRequests([]);
        setTransactions([]);
        setUsers([]);
        setReports([]);
      }
    };

    loadStats();
    return () => {
      active = false;
    };
  }, []);

  const now = new Date();
  const effectiveRange = trendDateRange || {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };

  const buckets = useMemo(() => {
    if (trendView === 'weekly') {
      return getWeekBucketsOfMonth(effectiveRange.from.getFullYear(), effectiveRange.from.getMonth());
    }
    if (isAnnualRange(effectiveRange.from, effectiveRange.to)) {
      return getYearMonthBuckets(effectiveRange.from.getFullYear());
    }
    return getCenteredMonthBuckets(effectiveRange.from.getFullYear(), effectiveRange.from.getMonth());
  }, [effectiveRange.from, effectiveRange.to, trendView]);

  const periodRequests = useMemo(
    () => requests.filter((request) => inRange(request.created_at, effectiveRange.from, effectiveRange.to)),
    [requests, effectiveRange.from, effectiveRange.to]
  );
  const periodTransactions = useMemo(
    () => transactions.filter((transaction) => inRange(transaction.created_at, effectiveRange.from, effectiveRange.to)),
    [transactions, effectiveRange.from, effectiveRange.to]
  );
  const periodReports = useMemo(
    () => reports.filter((report) => inRange(report.reported_at, effectiveRange.from, effectiveRange.to)),
    [reports, effectiveRange.from, effectiveRange.to]
  );

  const trendData = useMemo(
    () => buckets.map((bucket) => {
      const sourceRequests = trendView === 'monthly' ? requests : periodRequests;
      const bucketRequests = sourceRequests.filter((request) => inRange(request.created_at, bucket.from, bucket.to));
      return {
        label: bucket.label,
        collections: bucketRequests.length,
        completed: bucketRequests.filter((request) => request.status === 'completed').length,
      };
    }),
    [buckets, periodRequests, requests, trendView]
  );

  const totalRecycled = useMemo(
    () => periodTransactions.reduce((sum, transaction) => sum + Number(transaction.weight || 0), 0),
    [periodTransactions]
  );

  const activeUsersInPeriod = useMemo(() => {
    const ids = new Set<number>();
    periodRequests.forEach((request) => {
      ids.add(request.household);
      if (request.collector_user_id) ids.add(request.collector_user_id);
    });
    periodTransactions.forEach((transaction) => ids.add(transaction.recycler));
    periodReports.forEach((report) => {
      if (typeof report.reporter === 'number') ids.add(report.reporter);
    });
    return users.filter((user) => ids.has(user.id)).length;
  }, [periodReports, periodRequests, periodTransactions, users]);

  const areaStats = useMemo(() => {
    const locationMap = new Map<string, { collections: number; completed: number }>();
    periodRequests.forEach((request) => {
      const area = String(request.address || '').split(',')[0].trim() || 'Unknown';
      const existing = locationMap.get(area) || { collections: 0, completed: 0 };
      existing.collections += 1;
      if (request.status === 'completed') existing.completed += 1;
      locationMap.set(area, existing);
    });
    return Array.from(locationMap.entries()).map(([name, data]) => ({
      name,
      collections: data.collections,
      recyclingRate: data.collections > 0 ? Math.round((data.completed / data.collections) * 100) : 0,
    }));
  }, [periodRequests]);

  const compositionData = useMemo(() => {
    const wasteComposition = new Map<string, number>();
    periodTransactions.forEach((transaction) => {
      const materialType = transaction.material_type;
      const weight = Number(transaction.weight || 0);
      wasteComposition.set(materialType, (wasteComposition.get(materialType) || 0) + weight);
    });
    const totalWasteWeight = Array.from(wasteComposition.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(wasteComposition.entries())
      .map(([type, weight]) => ({
        type: type.charAt(0).toUpperCase() + type.slice(1),
        weight,
        percentage: Math.round((weight / totalWasteWeight) * 100),
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [periodTransactions]);

  const handleTrendViewChange = (view: 'weekly' | 'monthly') => {
    setTrendView(view);
  };

  const handleDateRangeChange = useCallback((from: Date, to: Date) => {
    setTrendDateRange({ from, to });
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">County Statistics</h1>
          <p className="text-muted-foreground">
            Comprehensive waste management analytics{isNairobiAuthority ? ' (Nairobi users only)' : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-6"><Truck className="w-8 h-8 text-primary mb-2" /><p className="text-2xl font-bold">{periodRequests.length}</p><p className="text-xs text-muted-foreground">Requests (Selected Range)</p></CardContent></Card>
          <Card><CardContent className="p-6"><Recycle className="w-8 h-8 text-success mb-2" /><p className="text-2xl font-bold">{totalRecycled} kg</p><p className="text-xs text-muted-foreground">Recycled (Selected Range)</p></CardContent></Card>
          <Card><CardContent className="p-6"><Users className="w-8 h-8 text-accent mb-2" /><p className="text-2xl font-bold">{activeUsersInPeriod}</p><p className="text-xs text-muted-foreground">Active Users (Selected Range)</p></CardContent></Card>
          <Card><CardContent className="p-6"><MapPin className="w-8 h-8 text-destructive mb-2" /><p className="text-2xl font-bold">{periodReports.filter((report) => report.status === 'resolved').length}</p><p className="text-xs text-muted-foreground">Resolved Reports (Selected Range)</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Collection Trend</CardTitle>
                <div className="flex gap-1 bg-secondary rounded-lg p-1">
                  <Button size="sm" variant={trendView === 'weekly' ? 'default' : 'ghost'} onClick={() => handleTrendViewChange('weekly')}>Weekly</Button>
                  <Button size="sm" variant={trendView === 'monthly' ? 'default' : 'ghost'} onClick={() => handleTrendViewChange('monthly')}>Monthly</Button>
                </div>
              </div>
              <DateRangeFilter viewMode={trendView} onDateRangeChange={handleDateRangeChange} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-6 h-48">
              {trendData.map((item) => {
                const maxVal = Math.max(...trendData.map((value) => value.collections), 1);
                return (
                  <div key={item.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex gap-1 items-end justify-center" style={{ height: '160px' }}>
                      <div className="w-1/2 bg-primary rounded-t" style={{ height: `${Math.max((item.collections / maxVal) * 160, item.collections > 0 ? 8 : 0)}px` }} title={`Total: ${item.collections}`} />
                      <div className="w-1/2 bg-success rounded-t" style={{ height: `${Math.max((item.completed / maxVal) * 160, item.completed > 0 ? 8 : 0)}px` }} title={`Completed: ${item.completed}`} />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-primary rounded" /><span className="text-sm text-muted-foreground">Total</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-success rounded" /><span className="text-sm text-muted-foreground">Completed</span></div>
            </div>
          </CardContent>
        </Card>

        {compositionData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Recycle className="w-5 h-5" />Waste Composition</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {compositionData.map((item) => (
                  <div key={item.type} className="space-y-2">
                    <div className="flex items-center justify-between text-sm"><span>{item.type}</span><span className="font-medium">{item.weight} kg ({item.percentage}%)</span></div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${item.percentage}%` }} /></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {areaStats.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Area Performance</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Area</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Collections</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Completion Rate</th>
                  </tr></thead>
                  <tbody>
                    {areaStats.map((area) => (
                      <tr key={area.name} className="border-b border-border/50">
                        <td className="py-3 px-2 text-sm font-medium">{area.name}</td>
                        <td className="py-3 px-2 text-sm">{area.collections}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-success rounded-full" style={{ width: `${area.recyclingRate}%` }} /></div>
                            <span className="text-sm">{area.recyclingRate}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

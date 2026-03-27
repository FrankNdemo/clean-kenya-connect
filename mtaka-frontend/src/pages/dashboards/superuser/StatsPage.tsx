import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, TrendingUp, Truck, Users, Recycle, MapPin } from 'lucide-react';
import {
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
import { KENYA_COUNTIES, locationMatchesCounty } from '@/lib/county';
import { useAuth } from '@/hooks/useAuth';

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

export default function SuperuserStatsPage() {
  const { user, isLoading } = useAuth();
  const [trendView, setTrendView] = useState<'weekly' | 'monthly'>('weekly');
  const [trendDateRange, setTrendDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [requests, setRequests] = useState<BackendCollectionRequest[]>([]);
  const [transactions, setTransactions] = useState<BackendRecyclerTransaction[]>([]);
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [reports, setReports] = useState<BackendDumpingReport[]>([]);
  const [listings, setListings] = useState<BackendRecyclableListing[]>([]);
  const [selectedCounty, setSelectedCounty] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      try {
        const [requestsRes, transactionsRes, usersRes, reportsRes, listingsRes] = await Promise.all([
          listCollectionRequests(),
          listRecyclerTransactionsApi(),
          listUsers(),
          listDumpingReportsApi(),
          listRecyclableListings(),
        ]);

        if (!active) return;

        setRequests(requestsRes);
        setTransactions(transactionsRes);
        setUsers(usersRes);
        setReports(reportsRes);
        setListings(listingsRes);
      } catch {
        if (!active) return;
        setRequests([]);
        setTransactions([]);
        setUsers([]);
        setReports([]);
        setListings([]);
      } finally {
        if (active) {
          setDataLoading(false);
        }
      }
    };

    if (user?.isSuperuser) {
      loadStats();
    } else {
      setDataLoading(false);
    }

    return () => {
      active = false;
    };
  }, [user]);

  const selectedCountyLabel = selectedCounty || 'All counties';
  const countyRequests = useMemo(
    () => requests.filter((request) => locationMatchesCounty(request.address, selectedCounty)),
    [requests, selectedCounty]
  );
  const listingsById = useMemo(() => {
    const map = new Map<number, BackendRecyclableListing>();
    listings.forEach((listing) => map.set(listing.id, listing));
    return map;
  }, [listings]);
  const countyTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const listing = transaction.listing ? listingsById.get(transaction.listing) : undefined;
        if (listing) {
          return locationMatchesCounty(listing.resident_location, selectedCounty);
        }
        return locationMatchesCounty(transaction.source, selectedCounty);
      }),
    [listingsById, selectedCounty, transactions]
  );
  const countyUsers = useMemo(
    () => users.filter((item) => locationMatchesCounty(item.county || item.location, selectedCounty)),
    [selectedCounty, users]
  );
  const countyReports = useMemo(
    () => reports.filter((item) => locationMatchesCounty(item.location, selectedCounty)),
    [reports, selectedCounty]
  );

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
    () => countyRequests.filter((request) => inRange(request.created_at, effectiveRange.from, effectiveRange.to)),
    [countyRequests, effectiveRange.from, effectiveRange.to]
  );
  const periodTransactions = useMemo(
    () => countyTransactions.filter((transaction) => inRange(transaction.created_at, effectiveRange.from, effectiveRange.to)),
    [countyTransactions, effectiveRange.from, effectiveRange.to]
  );
  const periodReports = useMemo(
    () => countyReports.filter((report) => inRange(report.reported_at, effectiveRange.from, effectiveRange.to)),
    [countyReports, effectiveRange.from, effectiveRange.to]
  );

  const trendData = useMemo(
    () =>
      buckets.map((bucket) => {
        const sourceRequests = trendView === 'monthly' ? countyRequests : periodRequests;
        const bucketRequests = sourceRequests.filter((request) => inRange(request.created_at, bucket.from, bucket.to));
        return {
          label: bucket.label,
          collections: bucketRequests.length,
          completed: bucketRequests.filter((request) => request.status === 'completed').length,
        };
      }),
    [buckets, countyRequests, periodRequests, trendView]
  );

  const totalRecycled = useMemo(
    () => periodTransactions.reduce((sum, transaction) => sum + Number(transaction.weight || 0), 0),
    [periodTransactions]
  );

  const activeUsersInPeriod = useMemo(() => {
    const ids = new Set<number>();
    periodRequests.forEach((request) => {
      if (request.household_user_id) ids.add(request.household_user_id);
      if (request.collector_user_id) ids.add(request.collector_user_id);
    });
    periodTransactions.forEach((transaction) => ids.add(transaction.recycler));
    periodReports.forEach((report) => {
      if (typeof report.reporter === 'number') ids.add(report.reporter);
    });
    return countyUsers.filter((userItem) => ids.has(userItem.id)).length;
  }, [countyUsers, periodReports, periodRequests, periodTransactions]);

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

  if (isLoading || !user) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">County Statistics</h1>
            <p className="text-muted-foreground">
              Inspect platform performance across any of the 47 counties.
            </p>
          </div>

          <div className="min-w-[240px]">
            <Select value={selectedCounty || '__all__'} onValueChange={(value) => setSelectedCounty(value === '__all__' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All counties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All counties</SelectItem>
                {KENYA_COUNTIES.map((county) => (
                  <SelectItem key={county} value={county}>
                    {county}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Current scope: {selectedCountyLabel}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <Truck className="mb-2 h-8 w-8 text-primary" />
              <p className="text-2xl font-bold">{periodRequests.length}</p>
              <p className="text-xs text-muted-foreground">Requests (Selected Range)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Recycle className="mb-2 h-8 w-8 text-success" />
              <p className="text-2xl font-bold">{totalRecycled} kg</p>
              <p className="text-xs text-muted-foreground">Recycled (Selected Range)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Users className="mb-2 h-8 w-8 text-accent" />
              <p className="text-2xl font-bold">{activeUsersInPeriod}</p>
              <p className="text-xs text-muted-foreground">Active Users (Selected Range)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <MapPin className="mb-2 h-8 w-8 text-destructive" />
              <p className="text-2xl font-bold">{periodReports.filter((report) => report.status === 'resolved').length}</p>
              <p className="text-xs text-muted-foreground">Resolved Reports (Selected Range)</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Collection Trend
                </CardTitle>
                <div className="flex gap-1 rounded-lg bg-secondary p-1">
                  <Button size="sm" variant={trendView === 'weekly' ? 'default' : 'ghost'} onClick={() => handleTrendViewChange('weekly')}>
                    Weekly
                  </Button>
                  <Button size="sm" variant={trendView === 'monthly' ? 'default' : 'ghost'} onClick={() => handleTrendViewChange('monthly')}>
                    Monthly
                  </Button>
                </div>
              </div>
              <DateRangeFilter viewMode={trendView} onDateRangeChange={handleDateRangeChange} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end justify-between gap-6">
              {trendData.map((item) => {
                const maxVal = Math.max(...trendData.map((value) => value.collections), 1);
                return (
                  <div key={item.label} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end justify-center gap-1" style={{ height: '160px' }}>
                      <div
                        className="w-1/2 rounded-t bg-primary"
                        style={{ height: `${Math.max((item.collections / maxVal) * 160, item.collections > 0 ? 8 : 0)}px` }}
                        title={`Total: ${item.collections}`}
                      />
                      <div
                        className="w-1/2 rounded-t bg-success"
                        style={{ height: `${Math.max((item.completed / maxVal) * 160, item.completed > 0 ? 8 : 0)}px` }}
                        title={`Completed: ${item.completed}`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-primary" />
                <span className="text-sm text-muted-foreground">Total</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-success" />
                <span className="text-sm text-muted-foreground">Completed</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {compositionData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Recycle className="h-5 w-5" />
                Waste Composition
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {compositionData.map((item) => (
                  <div key={item.type} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.type}</span>
                      <span className="font-medium">
                        {item.weight} kg ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {areaStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Area Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">Area</th>
                      <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">Collections</th>
                      <th className="px-2 py-3 text-left text-sm font-medium text-muted-foreground">Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areaStats.map((area) => (
                      <tr key={area.name} className="border-b border-border/50">
                        <td className="py-3 px-2 text-sm font-medium">{area.name}</td>
                        <td className="py-3 px-2 text-sm">{area.collections}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-secondary">
                              <div className="h-full rounded-full bg-success" style={{ width: `${area.recyclingRate}%` }} />
                            </div>
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

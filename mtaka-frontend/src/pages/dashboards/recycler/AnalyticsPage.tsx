import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { BarChart3, TrendingUp, Recycle, DollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MaterialInventory, RecyclingTransaction } from '@/lib/store';
import { fetchRecyclerInventoryDb, fetchRecyclerTransactionsDb } from '@/lib/recyclablesDb';

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

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [revenueView, setRevenueView] = useState<'monthly' | 'weekly'>('monthly');
  const [chartDateRange, setChartDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [myTransactions, setMyTransactions] = useState<RecyclingTransaction[]>([]);
  const [myInventory, setMyInventory] = useState<MaterialInventory[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [inventory, transactions] = await Promise.all([
        fetchRecyclerInventoryDb(),
        fetchRecyclerTransactionsDb(),
      ]);
      setMyInventory(inventory.filter((item) => String(item.recyclerId) === String(user.id)));
      setMyTransactions(transactions.filter((item) => String(item.recyclerId) === String(user.id)));
    })();
  }, [user]);

  if (!user) return null;

  const now = new Date();
  const effectiveRange = chartDateRange || {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };

  const buckets = useMemo(() => {
    if (revenueView === 'weekly') {
      return getWeekBucketsOfMonth(effectiveRange.from.getFullYear(), effectiveRange.from.getMonth());
    }
    if (isAnnualRange(effectiveRange.from, effectiveRange.to)) {
      return getYearMonthBuckets(effectiveRange.from.getFullYear());
    }
    return getCenteredMonthBuckets(effectiveRange.from.getFullYear(), effectiveRange.from.getMonth());
  }, [effectiveRange.from, effectiveRange.to, revenueView]);

  const periodTransactions = useMemo(
    () => myTransactions.filter((transaction) => inRange(transaction.createdAt, effectiveRange.from, effectiveRange.to)),
    [effectiveRange.from, effectiveRange.to, myTransactions]
  );

  const chartData = useMemo(
    () => buckets.map((bucket) => {
      const sourceTransactions = revenueView === 'monthly' ? myTransactions : periodTransactions;
      const bucketTransactions = sourceTransactions.filter((transaction) => inRange(transaction.createdAt, bucket.from, bucket.to));
      return {
        label: bucket.label,
        revenue: bucketTransactions.reduce((sum, transaction) => sum + transaction.price, 0),
        materials: bucketTransactions.reduce((sum, transaction) => sum + transaction.weight, 0),
      };
    }),
    [buckets, myTransactions, periodTransactions, revenueView]
  );

  const totalStock = myInventory.reduce((sum, item) => sum + item.stock, 0);
  const materialBreakdown = myInventory
    .filter((item) => item.stock > 0)
    .map((item) => {
      const colorMap: Record<string, string> = {
        plastic: 'bg-blue-500',
        metal: 'bg-slate-500',
        paper: 'bg-amber-500',
        glass: 'bg-emerald-500',
        electronics: 'bg-purple-500',
      };
      return {
        name: item.materialType.charAt(0).toUpperCase() + item.materialType.slice(1),
        percentage: totalStock > 0 ? Math.round((item.stock / totalStock) * 100) : 0,
        color: colorMap[item.materialType] || 'bg-muted',
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  const maxRevenue = Math.max(...chartData.map((item) => item.revenue), 1);
  const totalRevenue = chartData.reduce((sum, item) => sum + item.revenue, 0);
  const totalMaterials = chartData.reduce((sum, item) => sum + item.materials, 0);
  const nonZeroPeriods = chartData.filter((item) => item.revenue > 0).length || 1;
  const lastPeriod = chartData[chartData.length - 1]?.revenue || 0;
  const previousPeriod = chartData[chartData.length - 2]?.revenue || 0;
  const growthRate = previousPeriod > 0 ? ((lastPeriod - previousPeriod) / previousPeriod * 100).toFixed(1) : '0.0';

  const handleDateRangeChange = useCallback((from: Date, to: Date) => {
    setChartDateRange({ from, to });
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Analytics</h1>
          <p className="text-muted-foreground">Your personal business performance insights</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Revenue (Selected Range)</p><p className="text-lg font-bold">KES {totalRevenue.toLocaleString()}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center"><Recycle className="w-5 h-5 text-success" /></div><div><p className="text-xs text-muted-foreground">Materials (Selected Range)</p><p className="text-lg font-bold">{totalMaterials.toLocaleString()} kg</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-accent" /></div><div><p className="text-xs text-muted-foreground">Growth Rate</p><p className={`text-lg font-bold ${parseFloat(growthRate) >= 0 ? 'text-success' : 'text-destructive'}`}>{parseFloat(growthRate) >= 0 ? '+' : ''}{growthRate}%</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-info/20 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-info" /></div><div><p className="text-xs text-muted-foreground">Avg. per Period</p><p className="text-lg font-bold">KES {Math.round(totalRevenue / nonZeroPeriods).toLocaleString()}</p></div></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <CardTitle>My {revenueView === 'monthly' ? 'Monthly' : 'Weekly'} Revenue</CardTitle>
                <div className="flex gap-1 bg-secondary rounded-lg p-1">
                  <Button size="sm" variant={revenueView === 'monthly' ? 'default' : 'ghost'} onClick={() => setRevenueView('monthly')}>Monthly</Button>
                  <Button size="sm" variant={revenueView === 'weekly' ? 'default' : 'ghost'} onClick={() => setRevenueView('weekly')}>Weekly</Button>
                </div>
              </div>
              <DateRangeFilter viewMode={revenueView} onDateRangeChange={handleDateRangeChange} />
            </div>
          </CardHeader>
          <CardContent>
            {totalRevenue === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No revenue data yet</p>
                <p className="text-sm">Complete transactions to see your revenue chart</p>
              </div>
            ) : (
              <div className="flex items-end justify-between gap-4 h-48">
                {chartData.map((item) => (
                  <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-medium">{item.revenue > 0 ? `${item.revenue}` : ''}</span>
                    <div className="w-full bg-gradient-to-t from-primary to-primary/60 rounded-t-lg transition-all" style={{ height: `${(item.revenue / maxRevenue) * 140}px`, minHeight: item.revenue > 0 ? '8px' : '0' }} />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>My Material Breakdown</CardTitle></CardHeader>
          <CardContent>
            {materialBreakdown.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><Recycle className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No materials in inventory yet</p></div>
            ) : (
              <div className="space-y-4">
                {materialBreakdown.map((material) => (
                  <div key={material.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm"><span>{material.name}</span><span className="font-medium">{material.percentage}%</span></div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className={`h-full ${material.color} rounded-full transition-all`} style={{ width: `${material.percentage}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

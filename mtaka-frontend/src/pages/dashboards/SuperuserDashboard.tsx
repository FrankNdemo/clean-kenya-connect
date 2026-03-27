import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import {
  listCollectionRequests,
  listDumpingReportsApi,
  listRecyclableListings,
  listRecyclerTransactionsApi,
  listUsers,
  type BackendCollectionRequest,
  type BackendDumpingReport,
  type BackendRecyclerTransaction,
  type BackendRecyclableListing,
  type BackendUser,
} from '@/api';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Crown,
  Gauge,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function SuperuserDashboard() {
  const { user, isLoading } = useAuth();
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [requests, setRequests] = useState<BackendCollectionRequest[]>([]);
  const [reports, setReports] = useState<BackendDumpingReport[]>([]);
  const [transactions, setTransactions] = useState<BackendRecyclerTransaction[]>([]);
  const [listings, setListings] = useState<BackendRecyclableListing[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      try {
        const [usersRes, requestsRes, reportsRes, transactionsRes, listingsRes] = await Promise.all([
          listUsers(),
          listCollectionRequests(),
          listDumpingReportsApi(),
          listRecyclerTransactionsApi(),
          listRecyclableListings(),
        ]);

        if (!active) return;

        setUsers(usersRes);
        setRequests(requestsRes);
        setReports(reportsRes);
        setTransactions(transactionsRes);
        setListings(listingsRes);
      } catch {
        if (!active) return;
        setUsers([]);
        setRequests([]);
        setReports([]);
        setTransactions([]);
        setListings([]);
        toast.error('Failed to load superuser overview');
      } finally {
        if (active) {
          setIsLoadingData(false);
        }
      }
    };

    if (user?.isSuperuser) {
      loadOverview();
    } else {
      setIsLoadingData(false);
    }

    return () => {
      active = false;
    };
  }, [user]);

  const activeAccounts = users.filter((item) => item.is_active).length;
  const superuserAccounts = users.filter((item) => item.is_superuser).length;
  const authorityAccounts = users.filter((item) => item.user_type === 'authority' && !item.is_superuser).length;

  const recentWindowStart = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  }, []);

  const activeUserCount = useMemo(() => {
    const ids = new Set<number>();

    const isRecent = (value: string) => new Date(value) >= recentWindowStart;

    requests.forEach((request) => {
      if (!isRecent(request.created_at)) return;
      if (request.household_user_id) ids.add(request.household_user_id);
      if (request.collector_user_id) ids.add(request.collector_user_id);
    });

    transactions.forEach((transaction) => {
      if (!isRecent(transaction.created_at)) return;
      ids.add(transaction.recycler);
    });

    reports.forEach((report) => {
      if (!isRecent(report.reported_at)) return;
      if (typeof report.reporter === 'number') ids.add(report.reporter);
    });

    return ids.size;
  }, [recentWindowStart, requests, reports, transactions]);

  const completedRequests = requests.filter((item) => item.status === 'completed').length;
  const openReports = reports.filter((item) => item.status !== 'resolved').length;
  const totalRecycledKg = transactions.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const completionRate = requests.length > 0 ? Math.round((completedRequests / requests.length) * 100) : 0;

  if (isLoading || !user) return null;

  const quickActions = [
    {
      href: '/dashboard/superuser/stats',
      title: 'County Statistics',
      description: 'Pick any county and inspect waste and platform trends.',
      icon: BarChart3,
    },
    {
      href: '/dashboard/superuser/users',
      title: 'User Management',
      description: 'Reset passwords, review statuses, and delete stale accounts.',
      icon: Users,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              <Crown className="h-3.5 w-3.5" />
              Superuser dashboard
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">System overview</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Welcome, {user.name}. Monitor platform health, review usage trends, and move directly to user
                management or county statistics.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to="/dashboard/superuser/stats">
              <Button className="gap-2">
                County Statistics
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/dashboard/superuser/users">
              <Button variant="outline" className="gap-2">
                User Management
              </Button>
            </Link>
          </div>
        </div>

        <Card className="border-border/60 bg-muted/20">
          <CardContent className="grid gap-4 p-4 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Platform status</p>
                <p className="font-semibold">Operational</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10 text-info">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Active users</p>
                <p className="font-semibold">{activeUserCount} in the last 30 days</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Coverage</p>
                <p className="font-semibold">All 47 counties available</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
            value={activeAccounts}
            icon={CheckCircle2}
            description={`${users.length - activeAccounts} inactive`}
            iconClassName="bg-success/20 text-success"
          />
          <StatCard
            title="Active Users"
            value={activeUserCount}
            icon={Gauge}
            description="Unique accounts active in the last 30 days"
            iconClassName="bg-info/20 text-info"
          />
          <StatCard
            title="Open Reports"
            value={openReports}
            icon={XCircle}
            description="Outstanding incidents to review"
            iconClassName="bg-destructive/20 text-destructive"
          />
        </div>

        {isLoadingData ? (
          <div className="dashboard-section flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Crown className="h-5 w-5 animate-pulse" />
              <span className="text-sm font-medium">Loading superuser overview...</span>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    System Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Collection Requests</p>
                      <p className="mt-1 text-2xl font-bold">{requests.length}</p>
                      <p className="text-xs text-muted-foreground">{completedRequests} completed</p>
                    </div>
                    <div className="rounded-2xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Completion Rate</p>
                      <p className="mt-1 text-2xl font-bold">{completionRate}%</p>
                      <p className="text-xs text-muted-foreground">Across all requests</p>
                    </div>
                    <div className="rounded-2xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Recycled Weight</p>
                      <p className="mt-1 text-2xl font-bold">{totalRecycledKg} kg</p>
                      <p className="text-xs text-muted-foreground">Recorded recycler transactions</p>
                    </div>
                    <div className="rounded-2xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Recyclable Listings</p>
                      <p className="mt-1 text-2xl font-bold">{listings.length}</p>
                      <p className="text-xs text-muted-foreground">Resident material listings</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trash2 className="h-5 w-5" />
                    Admin Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-sm font-semibold">What this console manages</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Use the user management page to reset passwords or delete stale accounts. The county
                      statistics page lets you switch between any of the 47 counties and inspect performance
                      without leaving the superuser workspace.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Authority Users</p>
                      <p className="mt-1 text-2xl font-bold">{authorityAccounts}</p>
                    </div>
                    <div className="rounded-2xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Superusers</p>
                      <p className="mt-1 text-2xl font-bold">{superuserAccounts}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link
                        key={action.href}
                        to={action.href}
                        className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-semibold">{action.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

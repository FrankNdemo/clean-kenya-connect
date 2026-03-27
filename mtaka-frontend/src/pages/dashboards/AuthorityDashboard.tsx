import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EventDescriptionPreview } from '@/components/events/EventDescriptionPreview';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { DumpingReport } from '@/lib/store';
import { fetchDumpingReportsDb } from '@/lib/dumpingReportsDb';
import { getAuthorityCountyLabel, locationMatchesCounty } from '@/lib/county';
import {
  listEvents,
  approveEvent,
  rejectEvent,
  getProfile,
  listCollectionRequests,
  listRecyclerTransactionsApi,
  listUsers,
  listRecyclableListings,
  type BackendCollectionRequest,
  type BackendEvent,
  type BackendRecyclableListing,
} from '@/api';
import { Users, Truck, MapPin, Calendar, BarChart3, CheckCircle, XCircle, Recycle } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthorityDashboard() {
  const { user, isLoading } = useAuth();
  const [reports, setReports] = useState<DumpingReport[]>([]);
  const [pendingEvents, setPendingEvents] = useState<BackendEvent[]>([]);
  const [requests, setRequests] = useState<BackendCollectionRequest[]>([]);
  const [authorityCounty, setAuthorityCounty] = useState('');
  const [myStats, setMyStats] = useState({
    reportsHandled: 0,
    totalUsers: 0,
    totalRequests: 0,
    pendingRequests: 0,
    totalRecycled: 0,
    totalRecyclingValue: 0,
  });

  const refreshPendingEvents = async (county: string) => {
    try {
      const events = await listEvents();
      const pending = events.filter((event) => event.status === 'pending');
      const next = county
        ? pending.filter((event) => locationMatchesCounty(event.location, county))
        : pending;
      setPendingEvents(next);
    } catch (error) {
      toast.error('Failed to load pending events');
    }
  };

  useEffect(() => {
    if (user && user.role === 'authority') {
      Promise.all([
        getProfile(),
        fetchDumpingReportsDb(),
        listCollectionRequests(),
        listRecyclerTransactionsApi(),
        listUsers(),
        listRecyclableListings(),
      ])
        .then(([profileRes, allReports, collectionRequests, recyclerTransactions, dbUsers, listings]) => {
          const currentAuthorityCounty = getAuthorityCountyLabel(profileRes?.profile?.county || '');
          setAuthorityCounty(currentAuthorityCounty);

          const filteredRequests = currentAuthorityCounty
            ? collectionRequests.filter((request) => locationMatchesCounty(request.address, currentAuthorityCounty))
            : collectionRequests;

          const listingsById = new Map<number, BackendRecyclableListing>();
          listings.forEach((listing) => listingsById.set(listing.id, listing));

          const filteredTransactions = currentAuthorityCounty
            ? recyclerTransactions.filter((transaction) => {
              const listing = transaction.listing ? listingsById.get(transaction.listing) : undefined;
                if (listing) return locationMatchesCounty(listing.resident_location, currentAuthorityCounty);
                return locationMatchesCounty(transaction.source, currentAuthorityCounty);
              })
            : recyclerTransactions;

          const filteredReports = currentAuthorityCounty
            ? allReports.filter((report) => locationMatchesCounty(report.location, currentAuthorityCounty))
            : allReports;

          const filteredUsers = currentAuthorityCounty
            ? dbUsers.filter((dbUser) => locationMatchesCounty(dbUser.county || dbUser.location, currentAuthorityCounty))
            : dbUsers;

          setRequests(filteredRequests);
          setReports(filteredReports);

          setMyStats({
            reportsHandled: filteredReports.filter((report) => report.status === 'resolved').length,
            totalUsers: filteredUsers.length,
            totalRequests: filteredRequests.length,
            pendingRequests: filteredRequests.filter((request) => request.status === 'pending').length,
            totalRecycled: filteredTransactions.reduce((sum, transaction) => sum + Number(transaction.weight || 0), 0),
            totalRecyclingValue: filteredTransactions.reduce((sum, transaction) => sum + Number(transaction.price || 0), 0),
          });

          refreshPendingEvents(currentAuthorityCounty);
        })
        .catch(() => {
          setReports([]);
          setRequests([]);
        });
    }
  }, [user]);

  if (isLoading || !user) return null;

  const handleApproveEvent = async (eventId: number) => {
    try {
      await approveEvent(eventId);
      await refreshPendingEvents(authorityCounty);
      toast.success('Event approved!');
    } catch (error) {
      toast.error('Failed to approve event');
    }
  };

  const handleRejectEvent = async (eventId: number) => {
    try {
      await rejectEvent(eventId);
      await refreshPendingEvents(authorityCounty);
      toast.info('Event rejected.');
    } catch (error) {
      toast.error('Failed to reject event');
    }
  };

  const unresolvedReports = reports.filter((r) => r.status !== 'resolved');

  // Collection trends data from waste requests
  const now = new Date();
  const weeklyData = Array.from({ length: 4 }, (_, i) => {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (3 - i) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const weekRequests = requests.filter((r) => {
      const d = new Date(r.created_at);
      return d >= weekStart && d < weekEnd;
    });
    return {
      week: `W${i + 1}`,
      total: weekRequests.length,
      completed: weekRequests.filter((r) => r.status === 'completed').length,
    };
  });

  // Waste composition from requests
  const wasteComposition = ['organic', 'recyclable', 'hazardous', 'general'].map((type) => ({
    type,
    count: requests.filter((r) => {
      const wasteTypeName = String(r.waste_type_name || '').toLowerCase();
      if (type === 'organic') return wasteTypeName.includes('organic');
      if (type === 'recyclable') return wasteTypeName.includes('recycl');
      if (type === 'hazardous') return wasteTypeName.includes('hazard') || wasteTypeName.includes('electronic');
      return !wasteTypeName.includes('organic') && !wasteTypeName.includes('recycl') && !wasteTypeName.includes('hazard');
    }).length,
  }));
  const totalWaste = wasteComposition.reduce((s, w) => s + w.count, 0) || 1;

  const wasteColors: Record<string, string> = {
    organic: 'bg-success',
    recyclable: 'bg-primary',
    hazardous: 'bg-destructive',
    general: 'bg-muted-foreground',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Authority Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome, {user.name} - Monitor and manage waste management activities
            {authorityCounty ? ` (${authorityCounty} users only)` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard title="Total Users" value={myStats.totalUsers} icon={Users} description="Registered accounts" iconClassName="bg-primary/20 text-primary" />
          <StatCard title="Collection Requests" value={myStats.totalRequests} icon={Truck} description={`${myStats.pendingRequests} pending`} iconClassName="bg-info/20 text-info" />
          <StatCard title="Dumping Reports" value={reports.length} icon={MapPin} description={`${unresolvedReports.length} unresolved`} iconClassName="bg-destructive/20 text-destructive" />
          <StatCard title="Recycled" value={`${myStats.totalRecycled} kg`} icon={Recycle} description={`KES ${myStats.totalRecyclingValue.toLocaleString()} value`} iconClassName="bg-success/20 text-success" />
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Collection Trends</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end justify-between gap-4 h-48">
                {weeklyData.map((week) => (
                  <div key={week.week} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex gap-1 items-end justify-center" style={{ height: '160px' }}>
                      <div className="w-1/2 bg-primary rounded-t" style={{ height: `${Math.max((week.total / Math.max(...weeklyData.map(w => w.total), 1)) * 140, 4)}px` }} title={`Total: ${week.total}`} />
                      <div className="w-1/2 bg-success rounded-t" style={{ height: `${Math.max((week.completed / Math.max(...weeklyData.map(w => w.total), 1)) * 140, week.completed > 0 ? 4 : 0)}px` }} title={`Completed: ${week.completed}`} />
                    </div>
                    <span className="text-xs text-muted-foreground">{week.week}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-primary rounded" /><span className="text-sm text-muted-foreground">Total</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-success rounded" /><span className="text-sm text-muted-foreground">Completed</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Recycle className="w-5 h-5" />Waste Composition</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {wasteComposition.map(w => (
                  <div key={w.type} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="capitalize">{w.type}</span>
                      <span className="text-muted-foreground">{w.count} ({Math.round((w.count / totalWaste) * 100)}%)</span>
                    </div>
                    <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${wasteColors[w.type]} rounded-full`} style={{ width: `${(w.count / totalWaste) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Events & Reports */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="dashboard-section">
            <h2 className="text-lg font-semibold mb-4">Pending Event Approvals</h2>
            {pendingEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No pending events</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingEvents.map((event) => (
                  <div key={event.id} className="p-4 rounded-lg bg-secondary/50">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div><div className="font-medium">{event.title}</div><div className="text-sm text-muted-foreground">by {event.organizerName}</div></div>
                      <span className="px-2 py-1 text-xs rounded-full bg-warning/20 text-warning-foreground capitalize">{event.type}</span>
                    </div>
                    <EventDescriptionPreview
                      title={event.title}
                      description={event.description}
                      className="mb-3"
                    />
                    <div className="text-sm text-muted-foreground mb-3">📅 {event.date} • 📍 {event.location}</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button size="sm" className="w-full flex-1 gap-1 sm:w-auto" onClick={() => handleApproveEvent(event.id)}><CheckCircle className="w-4 h-4" />Approve</Button>
                      <Button size="sm" variant="destructive" className="w-full gap-1 sm:w-auto" onClick={() => handleRejectEvent(event.id)}><XCircle className="w-4 h-4" />Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-section">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Illegal Dumping Reports</h2>
              <Link to="/dashboard/authority/reports"><Button variant="link" size="sm">View All</Button></Link>
            </div>
            {unresolvedReports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No unresolved reports</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unresolvedReports.slice(0, 5).map((report) => (
                  <div key={report.id} className="p-4 rounded-lg bg-secondary/50">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-medium text-sm">{report.location}</div>
                        <div className="text-xs text-muted-foreground">Reported by {report.userName}</div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${report.status === 'reported' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning-foreground'}`}>{report.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{report.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { WasteRequest } from '@/lib/store';
import { BackendEvent, listEvents } from '@/api';
import { fetchCurrentUserCollectionRequests } from '@/lib/collectionRequestsApi';
import { 
  Truck, 
  Calendar, 
  Award, 
  MapPin, 
  Plus,
  Clock,
  CheckCircle,
  ArrowRight,
  Recycle
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ResidentDashboard() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<BackendEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [requests, setRequests] = useState<WasteRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'resident') {
      navigate('/login');
    }
  }, [isLoading, user, navigate]);

  const loadEvents = useCallback(async () => {
    try {
      const allEvents = await listEvents();
      setEvents(allEvents.filter((event) => event.status === 'approved' || event.status === 'ongoing'));
    } catch {
      // keep last successful event list if request temporarily fails
      setEvents((prev) => prev);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async (force = false) => {
    if (!user || user.role !== 'resident') return;
    try {
      const data = await fetchCurrentUserCollectionRequests(force);
      setRequests(data);
    } catch {
      // keep last successful request list if request temporarily fails
      setRequests((prev) => prev);
    } finally {
      setRequestsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setEventsLoading(true);
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setRequestsLoading(true);
    void loadRequests(true);

    const timer = globalThis.setInterval(() => {
      void loadRequests(false);
    }, 15000);

    const onFocus = () => {
      void loadRequests(true);
      void loadEvents();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      globalThis.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadEvents, loadRequests]);

  useEffect(() => {
    void loadRequests(true);
  }, [location.key, loadRequests]);

  const numericUserId = Number(user?.id ?? 0);
  const joinedEvents = useMemo(
    () => events.filter((event) => event.participants.includes(numericUserId)),
    [events, numericUserId]
  );

  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (!user) return null;

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'accepted');
  const completedRequests = requests.filter(r => r.status === 'completed');

  const getStatusBadge = (status: WasteRequest['status']) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs rounded-full bg-warning/20 text-warning-foreground">Pending</span>;
      case 'accepted':
        return <span className="px-2 py-1 text-xs rounded-full bg-info/20 text-info">Accepted</span>;
      case 'collected':
        return <span className="px-2 py-1 text-xs rounded-full bg-primary/20 text-primary">Collected</span>;
      case 'completed':
        return <span className="px-2 py-1 text-xs rounded-full bg-success/20 text-success">Completed</span>;
    }
  };

  const getWasteTypeLabel = (type: WasteRequest['wasteType']) => {
    switch (type) {
      case 'organic': return '🥬 Organic';
      case 'recyclable': return '♻️ Recyclable';
      case 'hazardous': return '⚠️ Hazardous';
      case 'general': return '🗑️ General';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user.name.split(' ')[0]}!</h1>
            <p className="text-muted-foreground">Here's what's happening with your waste management</p>
          </div>
          <div className="flex flex-row gap-2 sm:gap-3">
            <Link to="/waste/schedule" className="flex-1">
              <Button className="w-full gap-2">
                <Plus className="w-4 h-4" />
                Schedule Pickup
              </Button>
            </Link>
            <Link to="/waste/report" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <MapPin className="w-4 h-4" />
                Report Issue
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            title="Pending Pickups"
            value={pendingRequests.length}
            icon={Clock}
            description="Awaiting collection"
            iconClassName="bg-warning/20 text-warning"
          />
          <StatCard
            title="Completed"
            value={completedRequests.length}
            icon={CheckCircle}
            description="This month"
            iconClassName="bg-success/20 text-success"
          />
          <StatCard
            title="Events Joined"
            value={joinedEvents.length}
            icon={Calendar}
            description="Community activities"
            iconClassName="bg-info/20 text-info"
          />
          <StatCard
            title="Reward Points"
            value={user.rewardPoints}
            icon={Award}
            description="Keep earning!"
            iconClassName="bg-accent/20 text-accent"
          />
        </div>

        {/* Recent Requests & Upcoming Events */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Requests */}
          <div className="dashboard-section">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Recent Pickup Requests</h2>
              <Link to="/waste/schedule" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            
            {requestsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Loading pickup requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No pickup requests yet</p>
                <Link to="/waste/schedule">
                  <Button variant="link" className="mt-2">Schedule your first pickup</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.slice(0, 4).map((request) => (
                  <div key={request.id} className="flex flex-col gap-2 rounded-lg bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium text-sm">{getWasteTypeLabel(request.wasteType)}</div>
                      <div className="text-xs text-muted-foreground">{request.date} at {request.time}</div>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Events */}
          <div className="dashboard-section">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Upcoming Events</h2>
              <Link to="/events" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            
            {eventsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Loading events...</p>
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No upcoming events</p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.slice(0, 3).map((event) => (
                  <Link 
                    key={event.id} 
                    to="/events"
                    className="block p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-medium text-sm">{event.title}</div>
                        <div className="text-xs text-muted-foreground">{event.date} • {event.location}</div>
                      </div>
                      <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
                        +{event.rewardPoints} pts
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-section">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link to="/waste/schedule" className="p-4 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors text-center group">
              <Truck className="w-8 h-8 mx-auto mb-2 text-primary" />
              <div className="text-sm font-medium">Schedule Pickup</div>
            </Link>
            <Link to="/dashboard/resident/recyclables" className="p-4 rounded-xl bg-success/5 hover:bg-success/10 transition-colors text-center group">
              <Recycle className="w-8 h-8 mx-auto mb-2 text-success" />
              <div className="text-sm font-medium">List Recyclables</div>
            </Link>
            <Link to="/waste/report" className="p-4 rounded-xl bg-destructive/5 hover:bg-destructive/10 transition-colors text-center group">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-destructive" />
              <div className="text-sm font-medium">Report Dumping</div>
            </Link>
            <Link to="/events/create" className="p-4 rounded-xl bg-info/5 hover:bg-info/10 transition-colors text-center group">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-info" />
              <div className="text-sm font-medium">Create Event</div>
            </Link>
            <Link to="/dashboard/resident/rewards" className="p-4 rounded-xl bg-accent/10 hover:bg-accent/20 transition-colors text-center group">
              <Award className="w-8 h-8 mx-auto mb-2 text-accent" />
              <div className="text-sm font-medium">My Rewards</div>
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

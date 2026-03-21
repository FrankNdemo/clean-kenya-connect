import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { WasteRequest } from '@/lib/store';
import {
  fetchCollectorTransactionsDb,
  fetchCurrentUserCollectionRequests,
  type CollectorTransaction,
  updateWasteRequestDb,
} from '@/lib/collectionRequestsApi';
import { 
  Truck, 
  MapPin, 
  Clock,
  CheckCircle,
  Navigation,
  Package
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function CollectorDashboard() {
  const { user, isLoading } = useAuth();
  const [myRequests, setMyRequests] = useState<WasteRequest[]>([]);
  const [myTransactions, setMyTransactions] = useState<CollectorTransaction[]>([]);

  useEffect(() => {
    if (user && user.role === 'collector') refreshData();
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  if (!user) return null;

  const refreshData = async () => {
    try {
      const [requestRows, transactionRows] = await Promise.all([
        fetchCurrentUserCollectionRequests(true),
        fetchCollectorTransactionsDb(true),
      ]);
      setMyRequests(requestRows);
      setMyTransactions(transactionRows);
    } catch (error) {
      setMyRequests([]);
      setMyTransactions([]);
    }
  };
  
  const availableRequests = myRequests.filter((request) => request.status === 'pending');

  const myAssignments = myRequests.filter(r => r.status === 'accepted');
  const today = new Date().toISOString().split('T')[0];
  const myCompletedToday = myTransactions.filter((item) => item.createdAt.split('T')[0] === today);

  const handleAccept = async (requestId: string) => {
    setMyRequests((prev) =>
      prev.map((request) =>
        request.id === requestId
          ? { ...request, status: 'accepted', collectorId: user.id, collectorName: user.name }
          : request
      )
    );
    await updateWasteRequestDb(requestId, {
      status: 'accepted',
      collectorId: user.id,
      collectorName: user.name,
    });
    toast.success('Pickup accepted! It\'s now in your assignments.');
    void refreshData();
  };

  const handleComplete = (requestId: string) => {
    navigate(`/dashboard/collector/transactions?request=${requestId}`);
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
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user.name.split(' ')[0]}!</h1>
          <p className="text-muted-foreground">Manage your pickups and routes</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="My Assignments"
            value={myAssignments.length}
            icon={Truck}
            description="Active pickups"
            iconClassName="bg-primary/20 text-primary"
          />
          <StatCard
            title="Available Requests"
            value={availableRequests.length}
            icon={Package}
            description="Waiting for pickup"
            iconClassName="bg-warning/20 text-warning"
          />
          <StatCard
            title="Today's Pickups"
            value={myAssignments.filter(r => r.date === today).length}
            icon={Clock}
            description="Scheduled for today"
            iconClassName="bg-info/20 text-info"
          />
          <StatCard
            title="Completed Today"
            value={myCompletedToday.length}
            icon={CheckCircle}
            description="Keep it up!"
            iconClassName="bg-success/20 text-success"
          />
        </div>

        <div className="dashboard-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Collection Route</h2>
            <Link to="/dashboard/collector/routes">
              <Button variant="outline" size="sm" className="gap-2">
                <Navigation className="w-4 h-4" />
                View Routes
              </Button>
            </Link>
          </div>
          <div className="h-64 rounded-xl bg-secondary/50 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Route map visualization</p>
              <p className="text-sm">{myAssignments.length} assigned stops</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="dashboard-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">My Assignments</h2>
              <Link to="/dashboard/collector/requests">
                <Button variant="link" size="sm">View All</Button>
              </Link>
            </div>
            
            {myAssignments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No active assignments</p>
                <Link to="/dashboard/collector/requests">
                  <Button variant="link">Accept requests</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {myAssignments.slice(0, 3).map((request) => (
                  <div key={request.id} className="p-4 rounded-lg bg-secondary/50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium">{getWasteTypeLabel(request.wasteType)}</div>
                        <div className="text-sm text-muted-foreground">{request.userName}</div>
                      </div>
                      <span className="px-2 py-1 text-xs rounded-full bg-info/20 text-info">Accepted</span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {request.location}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {request.date} at {request.time}
                      </div>
                    </div>
                    <Button size="sm" className="w-full gap-1" onClick={() => handleComplete(request.id)}>
                      <CheckCircle className="w-4 h-4" />
                      Complete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Available Requests</h2>
              <Link to="/dashboard/collector/requests">
                <Button variant="link" size="sm">View All</Button>
              </Link>
            </div>
            
            {availableRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No pending requests</p>
                <p className="text-sm">Check back later</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableRequests.slice(0, 3).map((request) => (
                  <div key={request.id} className="p-4 rounded-lg bg-secondary/50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium">{getWasteTypeLabel(request.wasteType)}</div>
                        <div className="text-sm text-muted-foreground">{request.userName}</div>
                      </div>
                      <span className="px-2 py-1 text-xs rounded-full bg-warning/20 text-warning-foreground">Pending</span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {request.location}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {request.date} at {request.time}
                      </div>
                    </div>
                    <Button size="sm" className="w-full" onClick={() => handleAccept(request.id)}>
                      Accept Pickup
                    </Button>
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

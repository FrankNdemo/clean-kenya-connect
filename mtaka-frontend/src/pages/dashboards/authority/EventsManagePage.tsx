import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EventCoverMedia } from '@/components/events/EventCoverMedia';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listEvents, approveEvent, rejectEvent, joinEvent, BackendEvent } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { Calendar, MapPin, Users, CheckCircle, XCircle, Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';

const statusColors: Record<BackendEvent['status'], string> = {
  pending: 'bg-warning/20 text-warning',
  approved: 'bg-success/20 text-success',
  rejected: 'bg-destructive/20 text-destructive',
  completed: 'bg-secondary text-muted-foreground',
  expired: 'bg-warning/20 text-warning',
  ongoing: 'bg-info/20 text-info',
  cancelled: 'bg-destructive/20 text-destructive',
};

export default function EventsManagePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<BackendEvent[]>([]);

  const refreshEvents = async () => {
    try {
      const allEvents = await listEvents();
      setEvents(allEvents);
    } catch (error) {
      toast.error('Failed to load events');
    }
  };

  useEffect(() => {
    refreshEvents();
  }, []);

  const handleApprove = async (id: number) => {
    try {
      await approveEvent(id);
      await refreshEvents();
      toast.success('Event approved');
    } catch (error) {
      toast.error('Failed to approve event');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectEvent(id);
      await refreshEvents();
      toast.info('Event rejected');
    } catch (error) {
      toast.error('Failed to reject event');
    }
  };

  const handleJoin = async (eventId: number) => {
    if (!user) return;
    try {
      await joinEvent(eventId);
      await refreshEvents();
      toast.success('You\'ve joined the event!');
    } catch (error) {
      toast.error('Unable to join. Event may be full or you\'re already registered.');
    }
  };

  const isJoined = (event: BackendEvent) => user && event.participants.includes(Number(user.id));
  const pendingEvents = events.filter(e => e.status === 'pending');
  const otherEvents = events.filter(e => e.status !== 'pending');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Manage Events</h1>
            <p className="text-muted-foreground">Approve, reject, create, or join community events</p>
          </div>
          <Link to="/events/create">
            <Button className="gap-2"><Plus className="w-4 h-4" />Create Event</Button>
          </Link>
        </div>

        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Approvals ({pendingEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No pending events</p>
            ) : (
              <div className="space-y-4">
                {pendingEvents.map((event) => (
                  <div key={event.id} className="p-4 rounded-lg border border-warning/30 bg-warning/5">
                    <EventCoverMedia
                      src={event.coverImageUrl || event.cover_image || undefined}
                      alt={event.title}
                      className="mb-4 h-32 rounded-lg"
                    />
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">{event.title}</h3>
                        <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{event.date} at {event.time}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{event.location}</span>
                          <span className="flex items-center gap-1"><Users className="w-4 h-4" />Max {event.maxParticipants}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApprove(event.id)}><CheckCircle className="w-4 h-4 mr-1" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(event.id)}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Events */}
        <Card>
          <CardHeader><CardTitle>All Events</CardTitle></CardHeader>
          <CardContent>
            {otherEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No events processed yet</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {otherEvents.map((event) => (
                  <div key={event.id} className="h-full p-4 rounded-lg border border-border bg-card">
                    <EventCoverMedia
                      src={event.coverImageUrl || event.cover_image || undefined}
                      alt={event.title}
                      className="mb-4 h-28 rounded-lg"
                    />
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{event.title}</p>
                          <Badge className={statusColors[event.status]}>{event.status}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span>{event.date}</span>
                          <span>{event.location}</span>
                          <span>{event.participants.length}/{event.maxParticipants} participants</span>
                        </div>
                      </div>
                      {event.status === 'approved' && !isJoined(event) && (
                        <Button size="sm" variant="outline" onClick={() => handleJoin(event.id)}>Join Event</Button>
                      )}
                      {isJoined(event) && <Badge variant="secondary">Joined ✓</Badge>}
                    </div>
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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { type BackendEvent, approveEvent, joinEvent, listEvents, rejectEvent } from '@/api';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { EventCoverMedia } from '@/components/events/EventCoverMedia';
import { EventDescriptionPreview } from '@/components/events/EventDescriptionPreview';
import { EventScheduleChangeNotice } from '@/components/events/EventScheduleChangeNotice';
import { EventScheduleEditDialog } from '@/components/events/EventScheduleEditDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Calendar, CheckCircle, Clock, Mail, MapPin, Pencil, Phone, Plus, Users, XCircle } from 'lucide-react';
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

const getParticipantCount = (event: BackendEvent) => event.participantCount ?? event.participants?.length ?? 0;

const getIsJoined = (event: BackendEvent, userId?: number) => {
  if (typeof event.isJoined === 'boolean') return event.isJoined;
  if (!userId) return false;
  return event.participants?.includes(userId) ?? false;
};

export default function EventsManagePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<BackendEvent[]>([]);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedScheduleEvent, setSelectedScheduleEvent] = useState<BackendEvent | null>(null);

  const refreshEvents = async () => {
    try {
      const allEvents = await listEvents();
      setEvents(allEvents);
    } catch {
      toast.error('Failed to load events');
    }
  };

  useEffect(() => {
    void refreshEvents();
  }, []);

  const handleApprove = async (id: number) => {
    try {
      await approveEvent(id);
      await refreshEvents();
      toast.success('Event approved');
    } catch {
      toast.error('Failed to approve event');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectEvent(id);
      await refreshEvents();
      toast.info('Event rejected');
    } catch {
      toast.error('Failed to reject event');
    }
  };

  const handleJoin = async (eventId: number) => {
    if (!user) return;
    try {
      await joinEvent(eventId);
      await refreshEvents();
      toast.success("You've joined the event!");
    } catch {
      toast.error("Unable to join. Event may be full or you're already registered.");
    }
  };

  const openScheduleDialog = (event: BackendEvent) => {
    setSelectedScheduleEvent(event);
    setScheduleDialogOpen(true);
  };

  const isJoined = (event: BackendEvent) => getIsJoined(event, user ? Number(user.id) : undefined);
  const pendingEvents = events.filter((event) => event.status === 'pending');
  const otherEvents = events.filter((event) => event.status !== 'pending');

  const renderCreatorContact = (event: BackendEvent) => {
    if (!event.creatorEmail && !event.creatorPhone) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
        {event.creatorEmail ? (
          <a href={`mailto:${event.creatorEmail}`} className="inline-flex items-center gap-1 hover:text-foreground">
            <Mail className="w-4 h-4" />
            {event.creatorEmail}
          </a>
        ) : null}
        {event.creatorPhone ? (
          <a href={`tel:${event.creatorPhone}`} className="inline-flex items-center gap-1 hover:text-foreground">
            <Phone className="w-4 h-4" />
            {event.creatorPhone}
          </a>
        ) : null}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Manage Events</h1>
            <p className="text-muted-foreground">Approve, reject, reschedule, or join community events</p>
          </div>
          <Link to="/events/create">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Event
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Approvals ({pendingEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingEvents.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No pending events</p>
            ) : (
              <div className="space-y-4">
                {pendingEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <EventCoverMedia
                      src={event.coverImageUrl || event.cover_image || undefined}
                      alt={event.title}
                      className="mb-4 h-32 rounded-lg"
                    />
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold">{event.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Created by {event.organizerName}</p>
                        <EventDescriptionPreview
                          title={event.title}
                          description={event.description}
                          className="mb-2 mt-2"
                        />
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {event.date} at {event.time}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {event.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            Max {event.maxParticipants}
                          </span>
                        </div>
                        {renderCreatorContact(event)}
                        <EventScheduleChangeNotice change={event.latestScheduleChange} className="mt-3" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openScheduleDialog(event)}>
                          <Pencil className="mr-1 w-4 h-4" />
                          Edit Schedule
                        </Button>
                        <Button size="sm" onClick={() => handleApprove(event.id)}>
                          <CheckCircle className="mr-1 w-4 h-4" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(event.id)}>
                          <XCircle className="mr-1 w-4 h-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Events</CardTitle>
          </CardHeader>
          <CardContent>
            {otherEvents.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No events processed yet</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {otherEvents.map((event) => (
                  <div key={event.id} className="h-full rounded-lg border border-border bg-card p-4">
                    <EventCoverMedia
                      src={event.coverImageUrl || event.cover_image || undefined}
                      alt={event.title}
                      className="mb-4 h-28 rounded-lg"
                    />
                    <div className="flex flex-col gap-4">
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <p className="font-medium">{event.title}</p>
                          <Badge className={statusColors[event.status]}>{event.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Created by {event.organizerName}</p>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span>{event.date}</span>
                          <span>{event.location}</span>
                          <span>
                            {getParticipantCount(event)}/{event.maxParticipants} participants
                          </span>
                        </div>
                        {renderCreatorContact(event)}
                        <EventScheduleChangeNotice change={event.latestScheduleChange} className="mt-3" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openScheduleDialog(event)}>
                          <Pencil className="mr-1 w-4 h-4" />
                          Edit Schedule
                        </Button>
                        {event.status === 'approved' && !isJoined(event) ? (
                          <Button size="sm" variant="outline" onClick={() => handleJoin(event.id)}>
                            Join Event
                          </Button>
                        ) : null}
                        {isJoined(event) ? <Badge variant="secondary">Joined</Badge> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <EventScheduleEditDialog
          event={selectedScheduleEvent}
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          onUpdated={refreshEvents}
        />
      </div>
    </DashboardLayout>
  );
}

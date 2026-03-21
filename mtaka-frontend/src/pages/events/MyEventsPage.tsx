import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { 
  listMyEvents,
  listMyExpiredCreatedEvents,
  leaveEvent,
  cancelEvent,
  getEventParticipants,
  BackendEvent
} from '@/api';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Award,
  Plus,
  XCircle,
  Eye,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';

const eventTypeColors: Record<BackendEvent['type'], string> = {
  cleanup: 'bg-success/20 text-success',
  recycling: 'bg-primary/20 text-primary',
  awareness: 'bg-info/20 text-info',
  'tree-planting': 'bg-success/20 text-success',
};

const statusColors: Record<BackendEvent['status'], string> = {
  pending: 'bg-warning/20 text-warning',
  approved: 'bg-success/20 text-success',
  rejected: 'bg-destructive/20 text-destructive',
  completed: 'bg-secondary text-muted-foreground',
  expired: 'bg-warning/20 text-warning',
  ongoing: 'bg-info/20 text-info',
  cancelled: 'bg-destructive/20 text-destructive',
};

export default function MyEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<BackendEvent[]>([]);
  
  // Cancel/Leave Dialog State
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BackendEvent | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isOrganizer, setIsOrganizer] = useState(false);
  
  // View Participants Dialog State
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [participants, setParticipants] = useState<Array<{
    id: number;
    name: string;
    email: string;
  }>>([]);
  const [expiredEvents, setExpiredEvents] = useState<BackendEvent[]>([]);
  const [showExpiredEvents, setShowExpiredEvents] = useState(false);
  const [loadingExpiredEvents, setLoadingExpiredEvents] = useState(false);
  const [expiredDetailsOpen, setExpiredDetailsOpen] = useState(false);
  const [selectedExpiredEvent, setSelectedExpiredEvent] = useState<BackendEvent | null>(null);

  const refreshEvents = useCallback(async () => {
    if (!user) return;
    try {
      const myEvents = await listMyEvents();
      setEvents(myEvents);
    } catch (error) {
      toast.error('Failed to load your events');
    }
  }, [user]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  const openCancelDialog = (event: BackendEvent, organizer: boolean) => {
    setSelectedEvent(event);
    setIsOrganizer(organizer);
    setCancelReason('');
    setCancelDialogOpen(true);
  };

  const handleCancelOrLeave = async () => {
    if (!selectedEvent || !user || !cancelReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    if (isOrganizer) {
      try {
        await cancelEvent(selectedEvent.id, cancelReason);
        toast.success('Event cancelled successfully');
        await refreshEvents();
      } catch (error) {
        toast.error('Failed to cancel event');
      }
    } else {
      try {
        await leaveEvent(selectedEvent.id);
        toast.success('You have left the event');
        await refreshEvents();
      } catch (error) {
        toast.error('Failed to leave event');
      }
    }

    setCancelDialogOpen(false);
    setSelectedEvent(null);
    setCancelReason('');
  };

  const openParticipantsDialog = async (eventId: number) => {
    try {
      const eventParticipants = await getEventParticipants(eventId);
      setParticipants(eventParticipants.map((participant) => ({
        id: participant.id,
        name: participant.user_name,
        email: participant.user_email,
      })));
      setParticipantsDialogOpen(true);
    } catch (error) {
      toast.error('Failed to load participants');
    }
  };

  const retrieveExpiredEvents = async () => {
    setLoadingExpiredEvents(true);
    try {
      const expired = await listMyExpiredCreatedEvents();
      setExpiredEvents(expired);
      setShowExpiredEvents(true);
      toast.success(`Retrieved ${expired.length} expired event${expired.length === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error('Failed to retrieve expired events');
    } finally {
      setLoadingExpiredEvents(false);
    }
  };

  const openExpiredEventDetails = (event: BackendEvent) => {
    setSelectedExpiredEvent(event);
    setExpiredDetailsOpen(true);
  };

  const numericUserId = Number(user?.id || 0);
  const createdEvents = events.filter(e => e.organizerId === numericUserId && e.status !== 'expired');
  const joinedEvents = events.filter(
    e => e.organizerId !== numericUserId && e.status !== 'expired' && e.participants.includes(numericUserId)
  );

  if (!user) {
    return (
      <Layout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-2xl font-bold mb-4">Please log in to view your events</h1>
            <Link to="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">My Events</h1>
              <p className="text-muted-foreground">Manage your created and joined events</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={retrieveExpiredEvents}
                disabled={loadingExpiredEvents}
              >
                {loadingExpiredEvents ? 'Retrieving...' : 'Retrieve Expired Events'}
              </Button>
              <Link to="/events/create">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Event
                </Button>
              </Link>
            </div>
          </div>

          {/* Created Events */}
          <section className="mb-12">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Events I Created ({createdEvents.length})
            </h2>
            
            {createdEvents.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-8 text-center">
                <p className="text-muted-foreground mb-4">You haven't created any events yet</p>
                <Link to="/events/create">
                  <Button>Create Your First Event</Button>
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {createdEvents.map((event) => (
                  <div key={event.id} className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <Badge className={statusColors[event.status]}>{event.status}</Badge>
                        <Badge className={eventTypeColors[event.type]}>{event.type}</Badge>
                      </div>
                      
                      <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
                      
                      <div className="space-y-2 mb-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {event.date} at {event.time}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {event.location}
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          {event.participants.length} / {event.maxParticipants} participants
                        </div>
                      </div>

                      {event.status === 'cancelled' && event.cancellationReason && (
                        <div className="bg-destructive/10 p-3 rounded-lg mb-4">
                          <p className="text-xs text-destructive font-medium">Cancellation Reason:</p>
                          <p className="text-xs text-destructive">{event.cancellationReason}</p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => openParticipantsDialog(event.id)}
                          className="flex-1"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Participants
                        </Button>
                        
                        {event.status !== 'cancelled' && event.status !== 'completed' && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => openCancelDialog(event, true)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Joined Events */}
          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-success" />
              Events I Joined ({joinedEvents.length})
            </h2>
            
            {joinedEvents.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-8 text-center">
                <p className="text-muted-foreground mb-4">You haven't joined any events yet</p>
                <Link to="/events">
                  <Button>Browse Events</Button>
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {joinedEvents.map((event) => (
                  <div key={event.id} className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <Badge className={statusColors[event.status]}>{event.status}</Badge>
                        <span className="flex items-center gap-1 text-sm font-medium text-accent">
                          <Award className="w-4 h-4" />
                          +{event.rewardPoints}
                        </span>
                      </div>
                      
                      <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
                      <p className="text-xs text-muted-foreground mb-2">by {event.organizerName}</p>
                      
                      <div className="space-y-2 mb-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {event.date} at {event.time}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {event.location}
                        </div>
                      </div>

                      {event.status !== 'cancelled' && event.status !== 'completed' && (
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => openCancelDialog(event, false)}
                          className="w-full"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Leave Event
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {showExpiredEvents && (
            <section className="mt-12">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                Expired Events I Created ({expiredEvents.length})
              </h2>
              {expiredEvents.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <p className="text-muted-foreground">No expired events found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expiredEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => openExpiredEventDetails(event)}
                      className="w-full rounded-lg border border-border bg-card p-4 text-left hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{event.title}</p>
                          <p className="text-xs text-muted-foreground">{event.date} at {event.time}</p>
                        </div>
                        <Badge className="bg-warning/20 text-warning">Expired</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Cancel/Leave Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOrganizer ? 'Cancel Event' : 'Leave Event'}
            </DialogTitle>
            <DialogDescription>
              {isOrganizer 
                ? 'Are you sure you want to cancel this event? All participants will be notified.'
                : 'Are you sure you want to leave this event?'
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="bg-secondary/50 p-4 rounded-lg mb-4">
              <p className="font-semibold">{selectedEvent.title}</p>
              <p className="text-sm text-muted-foreground">{selectedEvent.date} at {selectedEvent.time}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for {isOrganizer ? 'cancellation' : 'leaving'} *</Label>
            <Textarea
              id="reason"
              placeholder={isOrganizer 
                ? 'Please explain why you are cancelling this event...'
                : 'Please explain why you are leaving this event...'
              }
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Go Back
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelOrLeave}
              disabled={!cancelReason.trim()}
            >
              {isOrganizer ? 'Cancel Event' : 'Leave Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expiredDetailsOpen} onOpenChange={setExpiredDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expired Event Details</DialogTitle>
            <DialogDescription>
              Review full details for your expired event.
            </DialogDescription>
          </DialogHeader>
          {selectedExpiredEvent && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="font-semibold text-base">{selectedExpiredEvent.title}</p>
                <p className="text-muted-foreground">{selectedExpiredEvent.description}</p>
              </div>
              <p><span className="font-medium">Type:</span> {selectedExpiredEvent.type}</p>
              <p><span className="font-medium">Date:</span> {selectedExpiredEvent.date}</p>
              <p><span className="font-medium">Time:</span> {selectedExpiredEvent.time}</p>
              <p><span className="font-medium">Location:</span> {selectedExpiredEvent.location}</p>
              <p><span className="font-medium">Status:</span> {selectedExpiredEvent.status}</p>
              <p><span className="font-medium">Total attendees:</span> {selectedExpiredEvent.participants.length}</p>
              <p><span className="font-medium">Max participants:</span> {selectedExpiredEvent.maxParticipants}</p>
              <p><span className="font-medium">Reward points:</span> {selectedExpiredEvent.rewardPoints}</p>
              {selectedExpiredEvent.cancellationReason && (
                <p><span className="font-medium">Cancellation reason:</span> {selectedExpiredEvent.cancellationReason}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setExpiredDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Participants Dialog */}
      <Dialog open={participantsDialogOpen} onOpenChange={setParticipantsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event Participants</DialogTitle>
            <DialogDescription>
              {participants.length} participant{participants.length !== 1 ? 's' : ''} registered
            </DialogDescription>
          </DialogHeader>
          
          {participants.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No participants yet</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {participants.map((participant) => (
                <div 
                  key={participant.id}
                  className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-semibold">
                      {participant.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{participant.name}</p>
                    <p className="text-xs text-muted-foreground">{participant.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setParticipantsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

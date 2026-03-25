import { useEffect, useState } from 'react';
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
import { listEvents, joinEvent, leaveEvent, BackendEvent } from '@/api';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Award,
  Search,
  Plus,
  Clock,
  XCircle,
  CalendarCheck
} from 'lucide-react';
import { toast } from 'sonner';

const eventTypeColors: Record<BackendEvent['type'], string> = {
  cleanup: 'bg-success/20 text-success',
  recycling: 'bg-primary/20 text-primary',
  awareness: 'bg-info/20 text-info',
  'tree-planting': 'bg-success/20 text-success',
};

const eventTypeLabels: Record<BackendEvent['type'], string> = {
  cleanup: '🧹 Cleanup',
  recycling: '♻️ Recycling',
  awareness: '📢 Awareness',
  'tree-planting': '🌳 Tree Planting',
};

const getDaysRemaining = (eventDate: string) => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(`${eventDate}T00:00:00`);
  const startOfEventDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((startOfEventDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
};

export default function EventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<BackendEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<BackendEvent['type'] | 'all'>('all');
  
  // Leave dialog state
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BackendEvent | null>(null);
  const [leaveReason, setLeaveReason] = useState('');

  const refreshEvents = async () => {
    try {
      const allEvents = await listEvents();
      setEvents(allEvents.filter(e => e.status === 'approved' || e.status === 'ongoing'));
    } catch (error) {
      toast.error('Failed to load events');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    refreshEvents();
    const timer = globalThis.setInterval(() => {
      void refreshEvents();
    }, 30000);
    const onFocus = () => {
      void refreshEvents();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      globalThis.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         event.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || event.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleJoin = async (eventId: number, eventDate: string) => {
    if (!user) {
      toast.error('Please log in to join events');
      return;
    }
    if (getDaysRemaining(eventDate) === 0) {
      toast.error('Joining is closed on the event day (D-Day)');
      return;
    }

    try {
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId && user && !event.participants.includes(Number(user.id))
            ? { ...event, participants: [...event.participants, Number(user.id)] }
            : event
        )
      );
      await joinEvent(eventId);
      await refreshEvents();
      toast.success('You\'ve joined the event! See you there.');
    } catch (error) {
      await refreshEvents();
      toast.error('Unable to join. Event may be full or you\'re already registered.');
    }
  };

  const openLeaveDialog = (event: BackendEvent) => {
    setSelectedEvent(event);
    setLeaveReason('');
    setLeaveDialogOpen(true);
  };

  const handleLeave = async () => {
    if (!selectedEvent || !user || !leaveReason.trim()) {
      toast.error('Please provide a reason for leaving');
      return;
    }

    try {
      setEvents((prev) =>
        prev.map((event) =>
          event.id === selectedEvent.id && user
            ? { ...event, participants: event.participants.filter((id) => id !== Number(user.id)) }
            : event
        )
      );
      await leaveEvent(selectedEvent.id);
      await refreshEvents();
      toast.success('You have left the event');
    } catch (error) {
      await refreshEvents();
      toast.error('Failed to leave event');
    }

    setLeaveDialogOpen(false);
    setSelectedEvent(null);
    setLeaveReason('');
  };

  const isJoined = (event: BackendEvent) => user && event.participants.includes(Number(user.id));
  const isOrganizer = (event: BackendEvent) => user && event.organizerId === Number(user.id);

  return (
    <Layout>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">Community Events</h1>
              <p className="text-muted-foreground">Join cleanups, recycling drives, and more</p>
            </div>
            <div className="flex gap-2">
              {user && (
                <>
                  <Link to="/events/my-events">
                    <Button variant="outline" className="gap-2">
                      <CalendarCheck className="w-4 h-4" />
                      My Events
                    </Button>
                  </Link>
                  <Link to="/events/create">
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" />
                      Create Event
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('all')}
              >
                All
              </Button>
              {Object.entries(eventTypeLabels).map(([value, label]) => (
                <Button
                  key={value}
                  variant={filterType === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterType(value as BackendEvent['type'])}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Events Grid */}
          {isLoadingEvents ? (
            <div className="text-center py-16">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Loading events...</h3>
              <p className="text-muted-foreground">Please wait a moment.</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No events found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || filterType !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Be the first to create a community event!'
                }
              </p>
              {user && (
                <Link to="/events/create">
                  <Button>Create an Event</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {filteredEvents.map((event) => (
                <div key={event.id} className="bg-card rounded-xl border border-border overflow-hidden card-hover">
                  {/* Event Header */}
                  <div className="h-32 bg-gradient-to-br from-primary/20 to-success/20 flex items-center justify-center relative">
                    <span className={`absolute top-3 right-3 px-2 py-1 text-xs rounded-full ${eventTypeColors[event.type]}`}>
                      {eventTypeLabels[event.type]}
                    </span>
                    {isOrganizer(event) && (
                      <Badge className="absolute top-3 left-3 bg-accent text-accent-foreground">
                        Your Event
                      </Badge>
                    )}
                    <Calendar className="w-12 h-12 text-primary" />
                  </div>

                  {/* Event Content */}
                  <div className="p-5">
                    <h3 className="font-semibold text-lg mb-2 line-clamp-1">{event.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{event.description}</p>
                    {getDaysRemaining(event.date) >= 0 && (
                      <div className="mb-3 inline-flex items-center rounded-md bg-yellow-100 px-2 py-1 text-xs font-bold text-yellow-800">
                        {getDaysRemaining(event.date) === 0
                          ? 'D-Day'
                          : `${getDaysRemaining(event.date)} day${getDaysRemaining(event.date) === 1 ? '' : 's'} remaining`}
                      </div>
                    )}
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        {event.date} at {event.time}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        {event.location}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        {event.participants.length} / {event.maxParticipants} participants
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-sm font-medium text-accent">
                        <Award className="w-4 h-4" />
                        +{event.rewardPoints} points
                      </span>
                      
                      {isOrganizer(event) ? (
                        <Link to="/events/my-events">
                          <Button variant="outline" size="sm">
                            Manage
                          </Button>
                        </Link>
                      ) : isJoined(event) ? (
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" disabled>
                            Joined ✓
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openLeaveDialog(event)}
                            className="text-destructive hover:text-destructive"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleJoin(event.id, event.date)}
                          disabled={getDaysRemaining(event.date) === 0}
                        >
                          {getDaysRemaining(event.date) === 0 ? 'D-Day Join Closed' : 'Join Event'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leave Event Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave this event?
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="bg-secondary/50 p-4 rounded-lg mb-4">
              <p className="font-semibold">{selectedEvent.title}</p>
              <p className="text-sm text-muted-foreground">{selectedEvent.date} at {selectedEvent.time}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for leaving *</Label>
            <Textarea
              id="reason"
              placeholder="Please explain why you are leaving this event..."
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleLeave}
              disabled={!leaveReason.trim()}
            >
              Leave Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

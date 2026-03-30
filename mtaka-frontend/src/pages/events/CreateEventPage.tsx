import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { createEvent, BackendEvent } from '@/api';
import { EventCoverMedia } from '@/components/events/EventCoverMedia';
import { 
  ArrowLeft, 
  Calendar,
  Clock,
  MapPin,
  Users,
  Award,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const eventTypes: { value: BackendEvent['type']; label: string; emoji: string }[] = [
  { value: 'cleanup', label: 'Community Cleanup', emoji: '🧹' },
  { value: 'recycling', label: 'Recycling Drive', emoji: '♻️' },
  { value: 'awareness', label: 'Awareness Campaign', emoji: '📢' },
  { value: 'tree-planting', label: 'Tree Planting', emoji: '🌳' },
];

export default function CreateEventPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    type: '' as BackendEvent['type'] | '',
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    maxParticipants: '30',
    rewardPoints: '30',
  });
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!coverImage) {
      setCoverImagePreview(null);
      return undefined;
    }

    const previewUrl = URL.createObjectURL(coverImage);
    setCoverImagePreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [coverImage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Please log in to create an event');
      navigate('/login');
      return;
    }

    if (!formData.type) {
      toast.error('Please select an event type');
      return;
    }

    setIsLoading(true);
    try {
      await createEvent({
        type: formData.type as BackendEvent['type'],
        title: formData.title,
        description: formData.description,
        date: formData.date,
        time: formData.time,
        location: formData.location,
        maxParticipants: parseInt(formData.maxParticipants),
        rewardPoints: parseInt(formData.rewardPoints),
        status: 'pending',
        coverImage,
      });

      toast.success('Event created! It will be visible once approved by the county authority.');
      navigate('/events');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const payload = error.response.data as Record<string, unknown>;
        const firstMessage = Object.values(payload)[0];
        const msg = Array.isArray(firstMessage)
          ? String(firstMessage[0])
          : String(firstMessage || 'Failed to create event');
        toast.error(msg);
      } else {
        toast.error('Failed to create event');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const coverPreviewSrc = coverImagePreview ?? undefined;

  return (
    <Layout showFooter={false}>
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background py-12 px-4">
        <div className="container max-w-2xl mx-auto">
          <Link to="/events" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Events
          </Link>

          <Card className="shadow-lg">
            <CardHeader>
              <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-success" />
              </div>
              <CardTitle className="text-2xl">Create Community Event</CardTitle>
              <CardDescription>Organize a cleanup, recycling drive, or awareness campaign</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Event Type */}
                <div className="space-y-3">
                  <Label>Event Type</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {eventTypes.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: type.value })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          formData.type === type.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <span className="text-2xl mb-2 block">{type.emoji}</span>
                        <div className="font-semibold text-sm">{type.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cover Image */}
                <div className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-4">
                  <div className="space-y-1">
                    <Label htmlFor="coverImage">Event Cover Image</Label>
                    <p className="text-xs text-muted-foreground">
                      Optional. Upload a photo to appear on the event card and in the background area.
                    </p>
                  </div>
                  <Input
                    id="coverImage"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setCoverImage(e.target.files?.[0] ?? null)}
                  />
                  <EventCoverMedia
                    src={coverPreviewSrc}
                    alt={formData.title ? `${formData.title} cover preview` : 'Event cover preview'}
                    className="h-52 rounded-2xl border border-border"
                    deferLoad={false}
                  />
                  {coverImage && (
                    <p className="text-xs text-muted-foreground">
                      Selected image: {coverImage.name}
                    </p>
                  )}
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Event Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Karura Forest Cleanup Day"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    placeholder="Tell people what the event is about, what to bring, etc."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-24 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Event Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="date"
                        type="date"
                        min={today}
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Start Time</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="time"
                        type="time"
                        value={formData.time}
                        onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="location"
                      placeholder="Where will the event take place?"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Participants & Points */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxParticipants">Max Participants</Label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="maxParticipants"
                        type="number"
                        min="5"
                        max="500"
                        value={formData.maxParticipants}
                        onChange={(e) => setFormData({ ...formData, maxParticipants: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rewardPoints">Reward Points</Label>
                    <div className="relative">
                      <Award className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="rewardPoints"
                        type="number"
                        min="10"
                        max="100"
                        value={formData.rewardPoints}
                        onChange={(e) => setFormData({ ...formData, rewardPoints: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-info/10 border border-info/30 rounded-lg p-4 text-sm">
                  <p className="font-medium text-info mb-1">Note</p>
                  <p className="text-muted-foreground">
                    Your event will need approval from the county authority before it becomes visible to others.
                  </p>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Creating...' : 'Create Event'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

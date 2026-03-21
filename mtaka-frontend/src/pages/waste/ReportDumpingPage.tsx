import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { createDumpingReportDb } from '@/lib/dumpingReportsDb';
import { ArrowLeft, MapPin, Camera, AlertTriangle, Upload, X, Navigation } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportDumpingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    location: '',
    description: '',
    imageUrl: '',
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useGPS, setUseGPS] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Default simulated coords
  const defaultCoords = {
    lat: -1.2921 + (Math.random() * 0.1 - 0.05),
    lng: 36.8219 + (Math.random() * 0.1 - 0.05),
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setGpsCoords(coords);
          setUseGPS(true);
          toast.success('Location captured successfully!');
        },
        () => {
          // Fallback to simulated coords
          setGpsCoords(defaultCoords);
          setUseGPS(true);
          toast.info('Using approximate location (GPS unavailable)');
        }
      );
    } else {
      setGpsCoords(defaultCoords);
      setUseGPS(true);
      toast.info('Using approximate location');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please log in to report illegal dumping');
      navigate('/login');
      return;
    }

    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const coords = gpsCoords || defaultCoords;

      await createDumpingReportDb({
        location: formData.location,
        coordinates: coords,
        description: formData.description,
        imageData: imagePreview || undefined,
      });

      toast.success('Report submitted! The county authority has been notified.');
      navigate('/dashboard/resident');
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: unknown } }).response?.data === 'object'
          ? Object.entries((error as { response: { data: Record<string, string[] | string> } }).response.data)
              .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
              .join(' | ')
          : 'Failed to submit report. Please try again.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const activeCoords = gpsCoords || defaultCoords;

  return (
    <Layout showFooter={false}>
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background py-12 px-4">
        <div className="container max-w-2xl mx-auto">
          <Link to={user ? '/dashboard/resident' : '/'} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <Card className="shadow-lg">
            <CardHeader>
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Report Illegal Dumping</CardTitle>
              <CardDescription>Help keep our community clean by reporting improper waste disposal</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor="location">Location Description</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="location"
                      placeholder="e.g., Behind Sarit Centre, Westlands"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Map / GPS Location */}
                <div className="space-y-2">
                  <Label>Location on Map</Label>
                  <div className="h-48 rounded-xl bg-secondary/50 border-2 border-dashed border-border flex flex-col items-center justify-center relative">
                    {useGPS ? (
                      <>
                        <MapPin className="w-8 h-8 text-success mb-2" />
                        <p className="text-sm text-success font-medium">Location captured!</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          📍 {activeCoords.lat.toFixed(4)}, {activeCoords.lng.toFixed(4)}
                        </p>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-8 h-8 text-primary mb-2" />
                        <p className="text-sm text-muted-foreground">Share your location for accurate reporting</p>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2"
                      onClick={handleGetLocation}
                    >
                      <Navigation className="w-4 h-4" />
                      {useGPS ? 'Update Location' : 'Share My Location'}
                    </Button>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    placeholder="Describe what you observed (type of waste, approximate amount, etc.)"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-32 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>

                {/* Image Upload */}
                <div className="space-y-2">
                  <Label>Photo Evidence (Optional)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {imagePreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-border">
                      <img src={imagePreview} alt="Evidence" className="w-full h-48 object-cover" />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={() => setImagePreview(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="h-32 rounded-xl bg-secondary/50 border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-secondary/70 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <Camera className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to upload or drag & drop</p>
                      <p className="text-xs text-muted-foreground">Max 5MB • JPG, PNG</p>
                    </div>
                  )}
                </div>

                <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-sm">
                  <p className="font-medium text-warning-foreground mb-1">Important</p>
                  <p className="text-muted-foreground">
                    Your report will be reviewed by county authorities. Please provide accurate information to help us address this issue quickly.
                  </p>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Submitting...' : 'Submit Report'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

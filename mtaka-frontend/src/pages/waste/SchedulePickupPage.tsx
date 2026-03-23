import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { getCountyFromLocation, locationMatchesCounty } from '@/lib/county';
import { WasteRequest, User } from '@/lib/store';
import { createWasteRequestDb, fetchCollectorsFromDb } from '@/lib/collectionRequestsApi';
import { resolveLocationCounty } from '@/api';
import { 
  ArrowLeft, 
  Truck, 
  Calendar, 
  Clock, 
  MapPin,
  LocateFixed,
  Leaf,
  Recycle,
  AlertTriangle,
  Trash2,
  User as UserIcon,
  Phone,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const wasteTypes: { value: WasteRequest['wasteType']; label: string; icon: typeof Leaf; description: string }[] = [
  { value: 'organic', label: 'Organic', icon: Leaf, description: 'Food waste, garden waste' },
  { value: 'recyclable', label: 'Recyclable', icon: Recycle, description: 'Plastic, paper, metal, glass' },
  { value: 'hazardous', label: 'Hazardous', icon: AlertTriangle, description: 'Batteries, chemicals, electronics' },
  { value: 'general', label: 'General', icon: Trash2, description: 'Non-recyclable items' },
];

export default function SchedulePickupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    wasteType: '' as WasteRequest['wasteType'] | '',
    date: '',
    time: '',
    location: user?.location || '',
    notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showCollectors, setShowCollectors] = useState(false);
  const [availableCollectors, setAvailableCollectors] = useState<User[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<User | null>(null);
  const [loadingCollectors, setLoadingCollectors] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [detectedCounty, setDetectedCounty] = useState('');
  const residentCounty = getCountyFromLocation(formData.location || user?.county || user?.location || '');

  const handleLocationChange = (location: string) => {
    setFormData({ ...formData, location });
    setSelectedCollector(null);
    setShowCollectors(false);
    setAvailableCollectors([]);
    setDetectedCounty('');
  };

  const resolveResidentCounty = async () => {
    const location = formData.location || user?.county || user?.location || '';
    if (!location) return '';

    try {
      const resolved = await resolveLocationCounty(location);
      return resolved.county || residentCounty;
    } catch {
      return residentCounty;
    }
  };

  const handleShowCollectors = async () => {
    if (!formData.wasteType) {
      toast.error('Please select a waste type first');
      return;
    }
    if (!formData.date || !formData.time) {
      toast.error('Please select date and time first');
      return;
    }
    if (!formData.location) {
      toast.error('Please enter your location first');
      return;
    }

    try {
      setLoadingCollectors(true);
      const resolvedCounty = await resolveResidentCounty();
      if (!resolvedCounty) {
        toast.error('We could not determine your county from this location. Please enter a more specific area or include the county name.');
        return;
      }
      setDetectedCounty(resolvedCounty);
      const allCollectors = await fetchCollectorsFromDb();
      const sameCountyCollectors = allCollectors.filter((collector) => {
        const collectorLocation = collector.county || collector.location;
        return locationMatchesCounty(collectorLocation, resolvedCounty);
      });
      setAvailableCollectors(sameCountyCollectors);
      setSelectedCollector(null);
      setShowCollectors(true);
      if (sameCountyCollectors.length === 0) {
        toast.error(`No collectors are currently listed in ${resolvedCounty} County.`);
      }
    } catch (error) {
      toast.error('Failed to load collectors from database');
    } finally {
      setLoadingCollectors(false);
    }
  };

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickupCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
        toast.success('Live pickup coordinates captured');
      },
      () => {
        setIsLocating(false);
        toast.error('Unable to fetch your live location');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const ensurePickupCoordinates = async () => {
    if (pickupCoords) return pickupCoords;
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      return null;
    }
    setIsLocating(true);
    try {
      const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          reject,
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
      setPickupCoords(coords);
      return coords;
    } catch {
      toast.error('Please enable location access to schedule pickup with route tracking');
      return null;
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Please log in to schedule a pickup');
      navigate('/login');
      return;
    }

    if (!formData.wasteType) {
      toast.error('Please select a waste type');
      return;
    }

    if (!selectedCollector) {
      toast.error('Please select a collector');
      return;
    }

    setIsLoading(true);

    try {
      const resolvedCounty = detectedCounty || (await resolveResidentCounty());
      if (!resolvedCounty) {
        toast.error('Please enter a clear location so we can match you with the right county.');
        setIsLoading(false);
        return;
      }

      setDetectedCounty(resolvedCounty);

      if (!locationMatchesCounty(selectedCollector.county || selectedCollector.location, resolvedCounty)) {
        toast.error(`Please choose a collector that serves ${resolvedCounty} County.`);
        setIsLoading(false);
        return;
      }

      const coordinates = await ensurePickupCoordinates();
      if (!coordinates) {
        setIsLoading(false);
        return;
      }

      await createWasteRequestDb({
        wasteType: formData.wasteType as WasteRequest['wasteType'],
        date: formData.date,
        time: formData.time,
        location: formData.location,
        coordinates,
        notes: formData.notes,
        collectorId: selectedCollector.id,
      });

      toast.success(`Pickup scheduled with ${selectedCollector.name}! They will confirm shortly.`);
      navigate('/dashboard/resident');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const payload = error.response.data as Record<string, unknown>;
        const firstMessage = Object.values(payload)[0];
        const msg = Array.isArray(firstMessage) ? String(firstMessage[0]) : String(firstMessage || 'Failed to schedule pickup');
        toast.error(msg);
      } else {
        toast.error('Failed to schedule pickup. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

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
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Truck className="w-7 h-7 text-primary" />
              </div>
              <CardTitle className="text-2xl">Schedule Waste Pickup</CardTitle>
              <CardDescription>Book a convenient time for waste collection at your location</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Waste Type Selection */}
                <div className="space-y-3">
                  <Label>Waste Type</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {wasteTypes.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, wasteType: type.value })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          formData.wasteType === type.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <type.icon className={`w-6 h-6 mb-2 ${formData.wasteType === type.value ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="font-semibold text-sm">{type.label}</div>
                        <div className="text-xs text-muted-foreground mt-1">{type.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Pickup Date</Label>
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
                    <Label htmlFor="time">Preferred Time</Label>
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
                  <Label htmlFor="location">Pickup Location</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="location"
                      placeholder="Enter your address"
                      value={formData.location}
                      onChange={(e) => handleLocationChange(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleUseLiveLocation}
                      disabled={isLocating}
                    >
                      <LocateFixed className="w-4 h-4" />
                      {isLocating ? 'Locating...' : (pickupCoords ? 'Refresh Live Coordinates' : 'Use Live Coordinates')}
                    </Button>
                    {pickupCoords && (
                      <span className="text-xs text-muted-foreground">
                        {pickupCoords.lat.toFixed(6)}, {pickupCoords.lng.toFixed(6)}
                      </span>
                    )}
                  </div>
                  {(detectedCounty || residentCounty) ? (
                    <p className="text-xs text-primary pt-1">
                      Detected county: {detectedCounty || residentCounty} County
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground pt-1">
                      Enter a clear area name so we can match you with collectors in the right county.
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <textarea
                    id="notes"
                    placeholder="Any special instructions for the collector..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full h-24 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Collector Selection */}
                {!showCollectors ? (
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={handleShowCollectors}
                    disabled={loadingCollectors}
                  >
                    <UserIcon className="w-4 h-4" />
                    {loadingCollectors ? 'Loading Collectors...' : 'Find Available Collectors'}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <Label>Select a Collector</Label>
                    {availableCollectors.length === 0 ? (
                      <div className="p-4 rounded-lg bg-muted text-center text-muted-foreground">
                        {(detectedCounty || residentCounty)
                          ? `No collectors are currently listed in ${detectedCounty || residentCounty} County. Try a different area or enter a more specific location.`
                          : 'No collectors available in your area. Try a different location.'}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {availableCollectors.map((collector) => {
                          const collectorCounty = collector.county || getCountyFromLocation(collector.location) || 'Unknown county';
                          const isNearby = collector.location.toLowerCase().includes(
                            formData.location.split(',')[0].trim().toLowerCase()
                          );
                          return (
                            <button
                              key={collector.id}
                              type="button"
                              onClick={() => setSelectedCollector(collector)}
                              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                                selectedCollector?.id === collector.id
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <UserIcon className="w-5 h-5 text-primary" />
                                  </div>
                                  <div>
                                    <div className="font-semibold">{collector.name}</div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                                      <MapPin className="w-3 h-3" />
                                      {collector.location}
                                      {isNearby && (
                                        <span className="px-2 py-0.5 text-xs rounded-full bg-success/20 text-success">
                                          Nearby
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      County: {collectorCounty}
                                    </div>
                                  </div>
                                </div>
                                {selectedCollector?.id === collector.id && (
                                  <CheckCircle className="w-5 h-5 text-primary" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg" 
                  disabled={isLoading || !selectedCollector}
                >
                  {isLoading ? 'Scheduling...' : selectedCollector ? `Schedule with ${selectedCollector.name}` : 'Select a Collector First'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

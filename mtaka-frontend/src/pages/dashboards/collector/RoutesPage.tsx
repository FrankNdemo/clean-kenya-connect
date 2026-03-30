import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { getUser, WasteRequest } from '@/lib/store';
import { MapPin, Navigation, Clock, Truck, Route, Phone, LocateFixed, ExternalLink, Flag, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchCollectorRouteSummaryDb,
  fetchCurrentUserCollectionRequests,
  type CollectorRouteStop,
  type CollectorRouteSummary,
} from '@/lib/collectionRequestsApi';

// Simulated coordinates for locations
const locationCoords: Record<string, { lat: number; lng: number }> = {
  'westlands': { lat: -1.2635, lng: 36.8020 },
  'kilimani': { lat: -1.2890, lng: 36.7840 },
  'industrial area': { lat: -1.3100, lng: 36.8500 },
  'karen': { lat: -1.3200, lng: 36.7100 },
  'lavington': { lat: -1.2800, lng: 36.7700 },
  'parklands': { lat: -1.2580, lng: 36.8180 },
  'langata': { lat: -1.3400, lng: 36.7500 },
  'embakasi': { lat: -1.3200, lng: 36.9000 },
  'kasarani': { lat: -1.2200, lng: 36.8900 },
  'ruaka': { lat: -1.2100, lng: 36.7700 },
};

const getCoords = (location: string) => {
  const coordMatch = location.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);
  if (coordMatch) {
    return { lat: Number(coordMatch[1]), lng: Number(coordMatch[3]) };
  }
  const area = location.split(',')[0].trim().toLowerCase();
  return locationCoords[area] || { lat: -1.2864, lng: 36.8172 };
};

const formatEta = (minutesFromNow: number) => {
  const eta = new Date(Date.now() + minutesFromNow * 60 * 1000);
  return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const calcDistance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// Simple nearest-neighbor TSP optimization
const optimizeRoute = (collectorCoords: { lat: number; lng: number }, stops: { location: string; coords: { lat: number; lng: number }; request: WasteRequest }[]) => {
  if (stops.length <= 1) return stops;
  const result: typeof stops = [];
  const remaining = [...stops];
  let current = collectorCoords;

  while (remaining.length > 0) {
    let nearest = 0;
    let nearestDist = Infinity;
    remaining.forEach((stop, i) => {
      const dist = calcDistance(current, stop.coords);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    result.push(remaining[nearest]);
    current = remaining[nearest].coords;
    remaining.splice(nearest, 1);
  }
  return result;
};

type RouteDisplayStop = {
  request: WasteRequest;
  location: string;
  coords: { lat: number; lng: number };
  legDistanceKm: number;
  etaMinutes: number;
  routeStop?: CollectorRouteStop;
};

const isPresent = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export default function RoutesPage() {
  const { user, isLoading } = useAuth();
  const [myRequests, setMyRequests] = useState<WasteRequest[]>([]);
  const [routeSummary, setRouteSummary] = useState<CollectorRouteSummary | null>(null);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [usingLiveLocation, setUsingLiveLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  const loadRequests = useCallback(async (force = false) => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const data = await fetchCurrentUserCollectionRequests(force);
      setMyRequests(data);
    } catch (error) {
      setMyRequests([]);
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadRequests(true);
    const timer = window.setInterval(() => {
      loadRequests(false);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [user, loadRequests]);

  const assignedRequests = myRequests.filter((request) => request.status === 'accepted');
  const routeSignature = assignedRequests
    .map((request) =>
      [
        request.id,
        request.status,
        request.location,
        request.coordinates?.lat ?? '',
        request.coordinates?.lng ?? '',
      ].join(':')
    )
    .join('|');

  const loadRouteSummary = useCallback(async (force = false) => {
    if (!user || assignedRequests.length === 0) {
      setRouteSummary(null);
      setIsRouteLoading(false);
      return;
    }

    setIsRouteLoading(true);
    try {
      const summary = await fetchCollectorRouteSummaryDb(
        {
          originLocation: usingLiveLocation && liveCoords ? 'Live location' : user.location,
          originLat: usingLiveLocation && liveCoords ? liveCoords.lat : undefined,
          originLng: usingLiveLocation && liveCoords ? liveCoords.lng : undefined,
        },
        force
      );
      setRouteSummary(summary);
    } catch {
      setRouteSummary(null);
    } finally {
      setIsRouteLoading(false);
    }
  }, [assignedRequests.length, liveCoords, user, usingLiveLocation]);

  useEffect(() => {
    if (!user) {
      setRouteSummary(null);
      return;
    }

    void loadRouteSummary(false);
  }, [user, routeSignature, usingLiveLocation, liveCoords?.lat, liveCoords?.lng, loadRouteSummary]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading routes...</p>
      </div>
    );
  }

  if (!user) return null;

  const collectorCoords = getCoords(user.location);
  const startCoords = usingLiveLocation && liveCoords ? liveCoords : collectorCoords;
  const requestById = new Map(assignedRequests.map((request) => [request.id, request]));

  const fallbackStops = assignedRequests.map((request) => ({
    location: request.location,
    coords: request.coordinates || getCoords(request.location),
    request,
  }));
  const fallbackOrderedStops = optimizeRoute(startCoords, fallbackStops);

  let fallbackDistance = 0;
  let fallbackPrev = startCoords;
  const fallbackDisplayStops: RouteDisplayStop[] = fallbackOrderedStops.map((stop, index) => {
    const legDistance = calcDistance(fallbackPrev, stop.coords);
    fallbackDistance += legDistance;
    fallbackPrev = stop.coords;
    const etaMinutes = Math.ceil((index + 1) * 10 + fallbackDistance * 2.4);

    return {
      request: stop.request,
      location: stop.location,
      coords: stop.coords,
      legDistanceKm: legDistance,
      etaMinutes,
    };
  });

  const fallbackEstimatedTime = Math.ceil(fallbackOrderedStops.length * 10 + fallbackDistance * 2.4);

  const routeDisplayStops: RouteDisplayStop[] = (routeSummary?.route || [])
    .map((stop) => {
      const request = requestById.get(stop.requestId);
      if (!request) return null;

      return {
        request,
        location: stop.location || request.location,
        coords: stop.snappedCoordinates || stop.coordinates,
        legDistanceKm: stop.driveDistanceKm,
        etaMinutes: stop.etaMinutes,
        routeStop: stop,
      };
    })
    .filter(isPresent);

  const orderedStops = routeDisplayStops.length > 0 ? routeDisplayStops : fallbackDisplayStops;
  const displayOriginCoords = routeSummary
    ? { lat: routeSummary.origin.lat, lng: routeSummary.origin.lng }
    : startCoords;
  const displayOriginLabel = routeSummary?.origin.label || (
    usingLiveLocation && liveCoords
      ? 'Live location'
      : user.location
  );
  const displayOriginText = usingLiveLocation && liveCoords
    ? `${displayOriginLabel} (${liveCoords.lat.toFixed(5)}, ${liveCoords.lng.toFixed(5)})`
    : displayOriginLabel;
  const totalDistance = routeSummary ? routeSummary.totalDistanceKm : fallbackDistance;
  const estimatedTime = routeSummary ? routeSummary.estimatedTimeMin : fallbackEstimatedTime;

  const handleOptimize = () => {
    void loadRouteSummary(true);
    toast.success('Route recalculated from road data');
  };

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLiveCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setUsingLiveLocation(true);
        setIsLocating(false);
        toast.success('Live location enabled');
      },
      () => {
        setIsLocating(false);
        toast.error('Unable to fetch live location');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const buildMapsDirectionsUrl = (destination: string, destinationCoords?: { lat: number; lng: number }) => {
    const base = 'https://www.google.com/maps/dir/?api=1';
    const destinationValue = destinationCoords
      ? `${destinationCoords.lat},${destinationCoords.lng}`
      : encodeURIComponent(destination);
    return `${base}&origin=${displayOriginCoords.lat},${displayOriginCoords.lng}&destination=${destinationValue}&travelmode=driving`;
  };

  const buildOptimizedRouteUrl = () => {
    if (orderedStops.length === 0) return '';
    const base = 'https://www.google.com/maps/dir/?api=1';
    const origin = `${displayOriginCoords.lat},${displayOriginCoords.lng}`;
    const destinationStop = orderedStops[orderedStops.length - 1];
    const destination = `${destinationStop.coords.lat},${destinationStop.coords.lng}`;
    const waypointStops = orderedStops
      .slice(0, -1)
      .map((stop) => `${stop.coords.lat},${stop.coords.lng}`)
      .join('|');
    const waypoints = waypointStops ? `&waypoints=${waypointStops}` : '';
    return `${base}&origin=${origin}&destination=${destination}${waypoints}&travelmode=driving`;
  };

  const buildEmbeddedRouteUrl = () => {
    if (orderedStops.length === 0) return '';
    const origin = `${displayOriginCoords.lat},${displayOriginCoords.lng}`;
    const destinationStop = orderedStops[orderedStops.length - 1];
    const destination = `${destinationStop.coords.lat},${destinationStop.coords.lng}`;
    const via = orderedStops
      .slice(0, -1)
      .map((stop) => `${stop.coords.lat},${stop.coords.lng}`)
      .join('+to:');
    const daddr = via ? `${via}+to:${destination}` : destination;
    return `https://maps.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(daddr)}&output=embed`;
  };

  // Get resident phone
  const getResidentPhone = (request: WasteRequest) => {
    if (request.userPhone) return request.userPhone;
    const resident = getUser(request.userId);
    return resident?.phone || '';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Routes</h1>
          <p className="text-muted-foreground">View and manage your collection routes based on accepted pickups</p>
        </div>

        {/* Route Map */}
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <CardTitle className="flex items-center gap-2">
                <Navigation className="w-5 h-5" />
                Route Map
              </CardTitle>
              <div className="max-w-full rounded-lg border border-border/60 bg-secondary/20 p-2">
                <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex min-w-0 flex-col gap-2 sm:inline-flex sm:w-max sm:flex-row sm:items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 gap-2 whitespace-nowrap sm:w-auto"
                    onClick={() => loadRequests(true)}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 gap-2 whitespace-nowrap sm:w-auto"
                    onClick={handleUseLiveLocation}
                    disabled={isLocating}
                  >
                    <LocateFixed className="w-4 h-4" />
                    {isLocating ? 'Locating...' : (usingLiveLocation ? 'Live Location On' : 'Use Live Location')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 gap-2 whitespace-nowrap sm:w-auto"
                    onClick={handleOptimize}
                    disabled={assignedRequests.length === 0 || isRouteLoading}
                  >
                    <Route className="w-4 h-4" />
                    {isRouteLoading ? 'Optimizing...' : 'Optimize Route'}
                  </Button>
                  {orderedStops.length > 0 && (
                    <a href={buildOptimizedRouteUrl()} target="_blank" rel="noreferrer" className="w-full shrink-0 sm:w-auto">
                      <Button variant="outline" size="sm" className="w-full shrink-0 gap-2 whitespace-nowrap sm:w-auto">
                        <ExternalLink className="w-4 h-4" />
                        Open Route
                      </Button>
                    </a>
                  )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {routeSummary
                    ? routeSummary.fallbackUsed
                      ? 'Fallback routing was used for one or more stops. Verify the request address if the route looks off.'
                      : 'Road distance and ETA are pulled from live map data.'
                    : 'Road distance and ETA will load once the route summary is ready.'}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {assignedRequests.length === 0 ? (
              <div className="h-64 rounded-xl bg-secondary/50 border-2 border-dashed border-border flex flex-col items-center justify-center">
                <MapPin className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No assigned pickups to route</p>
                <p className="text-sm text-muted-foreground">Accept pickup requests to generate routes</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <LocateFixed className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{usingLiveLocation ? 'Live Start Location' : 'Your Location'}</span>
                  <span className="text-xs text-muted-foreground">({displayOriginText})</span>
                </div>
                <div className="h-72 rounded-xl border border-border overflow-hidden bg-secondary/50">
                  <iframe
                    title="Collection Route Map"
                    src={buildEmbeddedRouteUrl()}
                    className="w-full h-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Route Summary */}
        {assignedRequests.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <Truck className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold">{assignedRequests.length}</p>
                <p className="text-sm text-muted-foreground">Total Stops</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Navigation className="w-8 h-8 text-info mx-auto mb-2" />
                <p className="text-2xl font-bold">{totalDistance.toFixed(1)} km</p>
                <p className="text-sm text-muted-foreground">Road Distance</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Clock className="w-8 h-8 text-warning mx-auto mb-2" />
                <p className="text-2xl font-bold">{estimatedTime} min</p>
                <p className="text-sm text-muted-foreground">Est. Time</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Assigned Routes List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Collection Route
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedRequests.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Accept pickup requests to build your collection route</p>
            ) : (
              <div className="space-y-0">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                      <Flag className="w-4 h-4" />
                    </div>
                    <div className="w-0.5 h-10 bg-primary/40" />
                  </div>
                  <div className="flex-1 p-4 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">Collector Office</span>
                      <Badge variant="outline">Start</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{displayOriginText}</p>
                  </div>
                </div>

                {orderedStops.map((stop, index) => {
                  const phone = getResidentPhone(stop.request);
                  const legDistance = stop.legDistanceKm ?? calcDistance(
                    index === 0 ? displayOriginCoords : orderedStops[index - 1].coords,
                    stop.coords
                  );
                  const stopEtaMinutes = stop.etaMinutes ?? Math.ceil(
                    (index + 1) * 10 + orderedStops
                      .slice(0, index + 1)
                      .reduce((sum, currentStop, stopIndex) => {
                        const fromCoords = stopIndex === 0 ? displayOriginCoords : orderedStops[stopIndex - 1].coords;
                        return sum + calcDistance(fromCoords, currentStop.coords);
                      }, 0) * 2.4
                  );
                  const isLast = index === orderedStops.length - 1;

                  return (
                    <div key={stop.request.id} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-warning/20 text-warning flex items-center justify-center">
                          <Flag className="w-4 h-4" />
                        </div>
                        {!isLast && <div className="w-0.5 h-14 bg-warning/40" />}
                      </div>
                      <div className="flex-1 p-4 rounded-lg border border-border bg-card hover:shadow-sm transition-shadow mb-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold">Resident Stop - {stop.request.userName}</h3>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-warning/20 text-warning-foreground">Pending Pickup</Badge>
                            <Badge variant="outline" className="text-xs">{legDistance.toFixed(1)} km</Badge>
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{stop.location}</div>
                          <div className="text-xs">
                            Coordinates: {stop.coords.lat.toFixed(6)}, {stop.coords.lng.toFixed(6)}
                          </div>
                          <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{stop.request.date} at {stop.request.time}</div>
                          <div className="text-xs">
                            ETA: {formatEta(stopEtaMinutes)} ({stopEtaMinutes} min)
                          </div>
                          <div className="capitalize">Waste: {stop.request.wasteType}</div>
                          {phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <a href={`tel:${phone}`} className="text-primary underline hover:text-primary/80">{phone}</a>
                            </div>
                          )}
                          <div className="pt-1">
                            <a href={buildMapsDirectionsUrl(stop.location, stop.coords)} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm" className="h-7 px-2 gap-1">
                                <Navigation className="w-3 h-3" />
                                Navigate
                              </Button>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

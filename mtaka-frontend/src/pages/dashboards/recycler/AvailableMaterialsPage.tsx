import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { 
  RecyclableListing,
  PriceOffer
} from '@/lib/store';
import {
  completeRecyclablePickupDb,
  createPriceOfferDb,
  fetchRecyclerListingsDb,
  fetchRecyclerOffersDb,
  scheduleRecyclablePickupDb,
} from '@/lib/recyclablesDb';
import { 
  Package, 
  MapPin, 
  Phone, 
  Calendar, 
  User,
  CheckCircle,
  Clock,
  Truck,
  Navigation,
  LocateFixed,
  DollarSign,
  Send,
  RefreshCcw,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';

const materialTypes = [
  { value: 'plastic', label: '♳ Plastic', pricePerKg: 20 },
  { value: 'paper', label: '📄 Paper', pricePerKg: 8 },
  { value: 'metal', label: '🔩 Metal', pricePerKg: 35 },
  { value: 'glass', label: '🫙 Glass', pricePerKg: 5 },
  { value: 'electronics', label: '📱 E-Waste', pricePerKg: 50 },
] as const;

const locationCoords: Record<string, { lat: number; lng: number }> = {
  westlands: { lat: -1.2635, lng: 36.802 },
  kilimani: { lat: -1.289, lng: 36.784 },
  "industrial area": { lat: -1.31, lng: 36.85 },
  karen: { lat: -1.32, lng: 36.71 },
  lavington: { lat: -1.28, lng: 36.77 },
  parklands: { lat: -1.258, lng: 36.818 },
  langata: { lat: -1.34, lng: 36.75 },
  embakasi: { lat: -1.32, lng: 36.9 },
  kasarani: { lat: -1.22, lng: 36.89 },
  ruaka: { lat: -1.21, lng: 36.77 },
};

const getCoordsFromText = (location: string) => {
  const coordMatch = location.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);
  if (coordMatch) {
    return { lat: Number(coordMatch[1]), lng: Number(coordMatch[3]) };
  }
  const area = location.split(",")[0].trim().toLowerCase();
  return locationCoords[area] || { lat: -1.2864, lng: 36.8172 };
};

const calcDistance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export default function AvailableMaterialsPage() {
  const { user } = useAuth();
  const [availableListings, setAvailableListings] = useState<RecyclableListing[]>([]);
  const [scheduledListings, setScheduledListings] = useState<RecyclableListing[]>([]);
  const [myOffers, setMyOffers] = useState<PriceOffer[]>([]);
  const [offerDialog, setOfferDialog] = useState<{ open: boolean; listing: RecyclableListing | null; isReOffer: boolean }>({
    open: false,
    listing: null,
    isReOffer: false,
  });
  const [offerForm, setOfferForm] = useState({
    offeredPricePerKg: '',
    message: '',
  });
  const [scheduleDialog, setScheduleDialog] = useState<{ open: boolean; listing: RecyclableListing | null }>({
    open: false,
    listing: null,
  });
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '09:00',
  });
  const [completeDialog, setCompleteDialog] = useState<{ open: boolean; listing: RecyclableListing | null }>({
    open: false,
    listing: null,
  });
  const [completeForm, setCompleteForm] = useState({
    actualWeight: '',
    paymentMethod: 'cash' as 'cash' | 'mpesa',
    mpesaCode: '',
  });
  const [liveStartCoords, setLiveStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const refreshData = useCallback(async () => {
    if (!user) return;
    const listings = await fetchRecyclerListingsDb();
    setAvailableListings(listings.filter((listing) => listing.status === 'available' || listing.status === 'offer_pending'));
    setScheduledListings(listings.filter((listing) => String(listing.recyclerId) === String(user.id)));
    const offers = await fetchRecyclerOffersDb();
    setMyOffers(offers.filter((offer) => String(offer.recyclerId) === String(user.id)));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshData();
  }, [refreshData, user]);

  if (!user) return null;

  const originCoords = liveStartCoords || getCoordsFromText(user.location);

  const getListingCoords = (listing: RecyclableListing) =>
    listing.residentCoordinates || getCoordsFromText(listing.residentLocation);

  const getDistanceKm = (listing: RecyclableListing) =>
    calcDistance(originCoords, getListingCoords(listing));

  const getEtaMinutes = (listing: RecyclableListing) =>
    Math.ceil(getDistanceKm(listing) * 2.4 + 8);

  const buildDirectionsUrl = (listing: RecyclableListing) => {
    const destination = getListingCoords(listing);
    const base = 'https://www.google.com/maps/dir/?api=1';
    if (liveStartCoords) {
      return `${base}&origin=${liveStartCoords.lat},${liveStartCoords.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
    }
    return `${base}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
  };

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLiveStartCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
        toast.success('Live route start enabled');
      },
      () => {
        setIsLocating(false);
        toast.error('Unable to fetch your live location');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const getMaterialInfo = (type: string) => {
    return materialTypes.find(m => m.value === type) || { label: type, pricePerKg: 0 };
  };

  // Get listings where my offer was accepted (waiting for me to schedule)
  const acceptedOfferListings = scheduledListings.filter(l => 
    l.status === 'offer_accepted' && String(l.recyclerId) === String(user.id)
  );

  // Get my scheduled pickups
  const myScheduledPickups = scheduledListings.filter(l => 
    l.status === 'scheduled' && String(l.recyclerId) === String(user.id)
  );

  // Get completed pickups
  const completedPickups = scheduledListings.filter(l => 
    l.status === 'completed' && String(l.recyclerId) === String(user.id)
  );

  // Get my pending offers
  const pendingOffers = myOffers.filter(o => o.status === 'pending');
  
  // Get my rejected offers
  const rejectedOffers = myOffers.filter(o => o.status === 'rejected');

  // Calculate total price from price per kg
  const calculateTotalPrice = (pricePerKg: number, weight: number) => {
    return pricePerKg * weight;
  };

  const handleSendOffer = async () => {
    if (!offerDialog.listing) return;
    
    const pricePerKg = parseFloat(offerForm.offeredPricePerKg);
    const totalPrice = calculateTotalPrice(pricePerKg, offerDialog.listing.estimatedWeight);
    
    await createPriceOfferDb({
      listingId: offerDialog.listing.id,
      recyclerId: user.id,
      recyclerName: user.name,
      recyclerPhone: user.phone,
      offeredPricePerKg: pricePerKg,
      offeredPrice: totalPrice,
      message: offerForm.message,
      isReOffer: offerDialog.isReOffer,
    });
    
    toast.success(offerDialog.isReOffer ? 'New price offer sent!' : 'Price offer sent to resident!');
    setOfferDialog({ open: false, listing: null, isReOffer: false });
    setOfferForm({ offeredPricePerKg: '', message: '' });
    await refreshData();
  };

  const handleSchedulePickup = async () => {
    if (!scheduleDialog.listing) return;
    
    await scheduleRecyclablePickupDb(
      scheduleDialog.listing.id,
      scheduleForm.date,
      scheduleForm.time
    );
    
    toast.success('Pickup scheduled successfully!');
    setScheduleDialog({ open: false, listing: null });
    setScheduleForm({ date: '', time: '09:00' });
    await refreshData();
  };

  const handleCompletePickup = async () => {
    if (!completeDialog.listing) return;
    
    if (completeForm.paymentMethod === 'mpesa' && !completeForm.mpesaCode.trim()) {
      toast.error('Please enter M-Pesa transaction code');
      return;
    }

    const result = await completeRecyclablePickupDb(
      completeDialog.listing.id,
      completeForm.paymentMethod,
      parseFloat(completeForm.actualWeight) || completeDialog.listing.estimatedWeight,
      completeForm.mpesaCode || undefined
    );

    if (result) {
      toast.success(`Pickup completed! ${result.inventory.stock}kg of ${result.transaction.materialType} now in inventory`);
      setCompleteDialog({ open: false, listing: null });
      setCompleteForm({ actualWeight: '', paymentMethod: 'cash', mpesaCode: '' });
      await refreshData();
    } else {
      toast.error('Failed to complete pickup');
    }
  };

  const getStatusBadge = (status: RecyclableListing['status']) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-success/20 text-success">Available</Badge>;
      case 'offer_pending':
        return <Badge className="bg-info/20 text-info">Offer Sent</Badge>;
      case 'offer_accepted':
        return <Badge className="bg-primary/20 text-primary">Offer Accepted</Badge>;
      case 'scheduled':
        return <Badge className="bg-warning/20 text-warning-foreground">Scheduled</Badge>;
      case 'completed':
        return <Badge className="bg-muted text-muted-foreground">Completed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Check if I already sent a pending offer for a listing
  const hasOfferedForListing = (listingId: string) => {
    return myOffers.some(o => o.listingId === listingId && o.status === 'pending');
  };

  // Check if my offer was rejected for a listing (can re-offer)
  const hasRejectedOfferForListing = (listingId: string) =>
    myOffers.some((offer) => offer.listingId === listingId && offer.status === 'rejected');

  const openReOfferDialog = (listing: RecyclableListing) => {
    const materialInfo = getMaterialInfo(listing.materialType);
    setOfferForm({
      offeredPricePerKg: String(materialInfo.pricePerKg),
      message: '',
    });
    setOfferDialog({ open: true, listing, isReOffer: true });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Available Materials</h1>
          <p className="text-muted-foreground">Browse materials and send price offers to residents</p>
          <div className="mt-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleUseLiveLocation} disabled={isLocating}>
              <LocateFixed className="w-4 h-4" />
              {isLocating ? 'Locating...' : (liveStartCoords ? 'Live Location On' : 'Use Live Location')}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Available</p>
                  <p className="text-xl sm:text-2xl font-bold">{availableListings.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-info/20 flex items-center justify-center flex-shrink-0">
                  <Send className="w-5 h-5 sm:w-6 sm:h-6 text-info" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">My Offers</p>
                  <p className="text-xl sm:text-2xl font-bold">{pendingOffers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-destructive" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Rejected</p>
                  <p className="text-xl sm:text-2xl font-bold">{rejectedOffers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-warning" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">To Schedule</p>
                  <p className="text-xl sm:text-2xl font-bold">{acceptedOfferListings.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Scheduled</p>
                  <p className="text-xl sm:text-2xl font-bold">{myScheduledPickups.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Accepted Offers - Need to Schedule */}
        {acceptedOfferListings.length > 0 && (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <CheckCircle className="w-5 h-5" />
                Ready to Schedule ({acceptedOfferListings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {acceptedOfferListings.map((listing) => {
                  const materialInfo = getMaterialInfo(listing.materialType);
                  return (
                    <div
                      key={listing.id}
                      className="p-4 rounded-xl border border-primary/30 bg-primary/5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-2xl">{materialInfo.label.split(' ')[0]}</span>
                            <h3 className="font-semibold">{materialInfo.label.split(' ')[1]}</h3>
                            <Badge className="bg-primary/20 text-primary">Offer Accepted</Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-lg text-primary">
                              KES {listing.offeredPrice} (Total)
                            </p>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <User className="w-4 h-4" />
                              {listing.residentName}
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="w-4 h-4" />
                              {listing.residentPhone}
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0" />
                              <span className="break-words">{listing.residentLocation}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getDistanceKm(listing).toFixed(1)} km away • ETA {getEtaMinutes(listing)} min
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Package className="w-4 h-4" />
                              {listing.estimatedWeight} kg
                            </div>
                          </div>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[11rem]">
                          <Button
                            className="w-full justify-center"
                            onClick={() => {
                              setScheduleForm({
                                date: listing.preferredDate,
                                time: listing.preferredTime,
                              });
                              setScheduleDialog({ open: true, listing });
                            }}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            Schedule Pickup
                          </Button>
                          <Button asChild variant="outline" className="w-full justify-center">
                            <a href={buildDirectionsUrl(listing)} target="_blank" rel="noreferrer">
                              <Navigation className="mr-2 h-4 w-4" />
                              Route
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Available Listings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Materials Listed by Residents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {availableListings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No materials available at the moment</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableListings.map((listing) => {
                  const materialInfo = getMaterialInfo(listing.materialType);
                  const estimatedValue = listing.estimatedWeight * materialInfo.pricePerKg;
                  const alreadyOffered = hasOfferedForListing(listing.id);
                  const wasRejected = hasRejectedOfferForListing(listing.id);
                  
                  return (
                    <div
                      key={listing.id}
                      className="p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{materialInfo.label.split(' ')[0]}</span>
                          <div>
                            <h3 className="font-semibold">{materialInfo.label.split(' ')[1]}</h3>
                            {wasRejected && !alreadyOffered ? (
                              <div>
                                <Badge className="bg-destructive/20 text-destructive">Offer Rejected</Badge>
                                {(() => {
                                  const rejectedOffs = myOffers.filter(
                                    (offer) => offer.listingId === listing.id && offer.status === 'rejected'
                                  );
                                  const lastRejected = rejectedOffs[rejectedOffs.length - 1];
                                  if (lastRejected?.rejectReason) {
                                    return (
                                      <p className="text-xs text-destructive mt-1">
                                        Reason: {lastRejected.rejectReason}
                                      </p>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            ) : alreadyOffered ? (
                              <Badge className="bg-info/20 text-info">Offer Sent</Badge>
                            ) : (
                              getStatusBadge(listing.status)
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">{listing.estimatedWeight} kg</p>
                          <p className="text-xs text-muted-foreground">~KES {estimatedValue} total</p>
                          <p className="text-xs text-muted-foreground">@ KES {materialInfo.pricePerKg}/kg</p>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">{listing.description}</p>

                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-4 h-4" />
                          <span>{listing.residentName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="w-4 h-4" />
                          <span>{listing.residentLocation}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {getDistanceKm(listing).toFixed(1)} km away • ETA {getEtaMinutes(listing)} min
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span>Preferred: {listing.preferredDate} at {listing.preferredTime}</span>
                        </div>
                      </div>

                      {wasRejected && !alreadyOffered ? (
                        <Button 
                          className="w-full gap-2"
                          onClick={() => openReOfferDialog(listing)}
                        >
                          <RefreshCcw className="w-4 h-4" />
                          Re-offer New Price
                        </Button>
                      ) : (
                        <Button 
                          className="w-full gap-2"
                          variant={alreadyOffered ? "secondary" : "default"}
                          disabled={alreadyOffered}
                          onClick={() => {
                            setOfferForm({
                              offeredPricePerKg: String(materialInfo.pricePerKg),
                              message: '',
                            });
                            setOfferDialog({ open: true, listing, isReOffer: false });
                          }}
                        >
                          {alreadyOffered ? (
                            <>
                              <Clock className="w-4 h-4" />
                              Waiting for Response
                            </>
                          ) : (
                            <>
                              <DollarSign className="w-4 h-4" />
                              Send Price Offer
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Scheduled Pickups */}
        {myScheduledPickups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                My Scheduled Pickups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {myScheduledPickups.map((listing) => {
                  const materialInfo = getMaterialInfo(listing.materialType);
                  
                  return (
                    <div
                      key={listing.id}
                      className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{materialInfo.label.split(' ')[0]}</span>
                        <div>
                          <p className="font-medium">{listing.residentName}</p>
                          <p className="text-sm text-muted-foreground">
                            {listing.scheduledDate} at {listing.scheduledTime} • {listing.estimatedWeight} kg
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {listing.residentLocation}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getDistanceKm(listing).toFixed(1)} km away • ETA {getEtaMinutes(listing)} min
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <div className="text-right">
                          <p className="font-bold text-primary">KES {listing.offeredPrice}</p>
                        </div>
                        <Button 
                          asChild
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                        >
                          <a href={buildDirectionsUrl(listing)} target="_blank" rel="noreferrer">
                            <Navigation className="w-4 h-4 mr-1" />
                            Route
                          </a>
                        </Button>
                        <Button 
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            setCompleteForm({
                              actualWeight: String(listing.estimatedWeight),
                              paymentMethod: 'cash',
                              mpesaCode: '',
                            });
                            setCompleteDialog({ open: true, listing });
                          }}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Complete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completed Pickups */}
        {completedPickups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                Completed ({completedPickups.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {completedPickups.slice(0, 5).map((listing) => {
                  const materialInfo = getMaterialInfo(listing.materialType);
                  return (
                    <div
                      key={listing.id}
                      className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{materialInfo.label.split(' ')[0]}</span>
                        <div>
                          <p className="font-medium">{listing.residentName}</p>
                          <p className="text-sm text-muted-foreground">
                            {listing.actualWeight || listing.estimatedWeight} kg
                          </p>
                        </div>
                      </div>
                      <span className="font-medium text-success">
                        KES {listing.offeredPrice}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Send Offer Dialog */}
      <Dialog open={offerDialog.open} onOpenChange={(open) => setOfferDialog({ open, listing: null, isReOffer: false })}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {offerDialog.isReOffer ? 'Send New Price Offer' : 'Send Price Offer'}
            </DialogTitle>
          </DialogHeader>
          {offerDialog.listing && (
            <div className="space-y-4 py-4">
              {offerDialog.isReOffer && (
                <div className="p-3 bg-warning/10 rounded-lg text-sm">
                  <p className="text-warning-foreground font-medium">Your previous offer was rejected.</p>
                  <p className="text-muted-foreground">Consider adjusting your price to match the resident's expectations.</p>
                </div>
              )}
              
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="font-medium">{getMaterialInfo(offerDialog.listing.materialType).label}</p>
                <p className="text-sm text-muted-foreground">
                  {offerDialog.listing.estimatedWeight} kg from {offerDialog.listing.residentName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {offerDialog.listing.residentLocation}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Price per Kilogram (KES/kg)</Label>
                <Input
                  type="number"
                  placeholder="Enter your price per kg"
                  value={offerForm.offeredPricePerKg}
                  onChange={(e) => setOfferForm({ ...offerForm, offeredPricePerKg: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Market rate: ~KES {getMaterialInfo(offerDialog.listing.materialType).pricePerKg}/kg
                </p>
              </div>

              {offerForm.offeredPricePerKg && (
                <div className="p-3 bg-primary/10 rounded-lg">
                  <p className="text-sm font-medium text-primary">
                    Total Price: KES {calculateTotalPrice(
                      parseFloat(offerForm.offeredPricePerKg), 
                      offerDialog.listing.estimatedWeight
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {offerForm.offeredPricePerKg} KES/kg × {offerDialog.listing.estimatedWeight} kg
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Message (Optional)</Label>
                <Textarea
                  placeholder="Add a message to the resident..."
                  value={offerForm.message}
                  onChange={(e) => setOfferForm({ ...offerForm, message: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialog({ open: false, listing: null, isReOffer: false })}>
              Cancel
            </Button>
            <Button onClick={handleSendOffer} disabled={!offerForm.offeredPricePerKg}>
              <Send className="w-4 h-4 mr-2" />
              {offerDialog.isReOffer ? 'Send New Offer' : 'Send Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Pickup Dialog */}
      <Dialog open={scheduleDialog.open} onOpenChange={(open) => setScheduleDialog({ open, listing: null })}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Schedule Pickup</DialogTitle>
          </DialogHeader>
          {scheduleDialog.listing && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="font-medium">{getMaterialInfo(scheduleDialog.listing.materialType).label}</p>
                <p className="text-sm text-muted-foreground">
                  {scheduleDialog.listing.estimatedWeight} kg • KES {scheduleDialog.listing.offeredPrice}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Phone className="w-3 h-3" /> {scheduleDialog.listing.residentPhone}
                </p>
                <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="break-words">{scheduleDialog.listing.residentLocation}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Pickup Date</Label>
                <Input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Pickup Time</Label>
                <Input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                  required
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialog({ open: false, listing: null })}>
              Cancel
            </Button>
            <Button onClick={handleSchedulePickup} disabled={!scheduleForm.date}>
              Confirm Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Pickup Dialog */}
      <Dialog open={completeDialog.open} onOpenChange={(open) => setCompleteDialog({ open, listing: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Pickup</DialogTitle>
          </DialogHeader>
          {completeDialog.listing && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="font-medium">{getMaterialInfo(completeDialog.listing.materialType).label}</p>
                <p className="text-sm text-muted-foreground">
                  From {completeDialog.listing.residentName}
                </p>
                <p className="text-sm font-medium text-primary mt-1">
                  Agreed Price: KES {completeDialog.listing.offeredPrice}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Actual Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder={`Estimated: ${completeDialog.listing.estimatedWeight} kg`}
                  value={completeForm.actualWeight}
                  onChange={(e) => setCompleteForm({ ...completeForm, actualWeight: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use estimated weight ({completeDialog.listing.estimatedWeight} kg)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <select
                  value={completeForm.paymentMethod}
                  onChange={(e) => setCompleteForm({ 
                    ...completeForm, 
                    paymentMethod: e.target.value as 'cash' | 'mpesa',
                    mpesaCode: e.target.value === 'cash' ? '' : completeForm.mpesaCode
                  })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="mpesa">📱 M-Pesa</option>
                </select>
              </div>

              {completeForm.paymentMethod === 'mpesa' && (
                <div className="space-y-2">
                  <Label>M-Pesa Transaction Code</Label>
                  <Input
                    placeholder="e.g., SHK7X9M2YP"
                    value={completeForm.mpesaCode}
                    onChange={(e) => setCompleteForm({ ...completeForm, mpesaCode: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog({ open: false, listing: null })}>
              Cancel
            </Button>
            <Button onClick={handleCompletePickup}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Pickup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

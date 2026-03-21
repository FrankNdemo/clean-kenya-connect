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
  acceptPriceOfferDb,
  createRecyclableListingDb,
  deleteRecyclableListingDb,
  fetchListingOffersDb,
  fetchResidentListingsDb,
  fetchResidentOffersDb,
  rejectPriceOfferDb,
  updateRecyclableListingDb,
} from '@/lib/recyclablesDb';
import { Recycle, Plus, Package, Clock, CheckCircle, Calendar, Trash2, Edit, Eye, DollarSign, MessageSquare, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';

const materialTypes = [
  { value: 'plastic', label: '♳ Plastic', pricePerKg: 20 },
  { value: 'paper', label: '📄 Paper', pricePerKg: 8 },
  { value: 'metal', label: '🔩 Metal', pricePerKg: 35 },
  { value: 'glass', label: '🫙 Glass', pricePerKg: 5 },
  { value: 'electronics', label: '📱 E-Waste', pricePerKg: 50 },
] as const;

export default function ListRecyclablesPage() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [listings, setListings] = useState<RecyclableListing[]>([]);
  const [formData, setFormData] = useState({
    materialType: 'plastic' as RecyclableListing['materialType'],
    estimatedWeight: '',
    description: '',
    preferredDate: '',
    preferredTime: '09:00',
  });
  const [editDialog, setEditDialog] = useState<{ open: boolean; listing: RecyclableListing | null }>({
    open: false,
    listing: null,
  });
  const [offersDialog, setOffersDialog] = useState<{ open: boolean; listing: RecyclableListing | null; offers: PriceOffer[] }>({
    open: false,
    listing: null,
    offers: [],
  });
  const [viewDialog, setViewDialog] = useState<{ open: boolean; listing: RecyclableListing | null }>({
    open: false,
    listing: null,
  });
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; offerId: string }>({ open: false, offerId: '' });
  const [rejectReason, setRejectReason] = useState('');
  const [offersByListing, setOffersByListing] = useState<Record<string, PriceOffer[]>>({});
  const [residentCoords, setResidentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const refreshListings = useCallback(async () => {
    if (!user) return;
    const all = await fetchResidentListingsDb();
    const mine = all.filter((row) => String(row.residentId) === String(user.id));
    setListings(mine);
    const allOffers = await fetchResidentOffersDb();
    const grouped: Record<string, PriceOffer[]> = {};
    allOffers.forEach((offer) => {
      grouped[offer.listingId] = grouped[offer.listingId] || [];
      grouped[offer.listingId].push(offer);
    });
    setOffersByListing(grouped);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await refreshListings();
    })();
  }, [refreshListings, user]);

  if (!user) return null;

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setResidentCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
        toast.success('Live recyclable pickup coordinates captured');
      },
      () => {
        setIsLocating(false);
        toast.error('Unable to fetch your live location');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const ensureResidentCoordinates = async () => {
    if (residentCoords) return residentCoords;
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
      setResidentCoords(coords);
      return coords;
    } catch {
      toast.error('Please enable location access to list recyclables with route tracking');
      return null;
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const coords = await ensureResidentCoordinates();
    if (!coords) return;

    await createRecyclableListingDb({
      residentId: user.id,
      residentName: user.name,
      residentPhone: user.phone,
      residentLocation: user.location,
      residentCoordinates: coords,
      materialType: formData.materialType,
      estimatedWeight: parseFloat(formData.estimatedWeight),
      description: formData.description,
      preferredDate: formData.preferredDate,
      preferredTime: formData.preferredTime,
    });

    toast.success('Recyclable materials listed successfully! Recyclers can now send price offers.');
    setFormData({
      materialType: 'plastic',
      estimatedWeight: '',
      description: '',
      preferredDate: '',
      preferredTime: '09:00',
    });
    setShowForm(false);
    await refreshListings();
  };

  const handleEdit = (listing: RecyclableListing) => {
    setFormData({
      materialType: listing.materialType,
      estimatedWeight: String(listing.estimatedWeight),
      description: listing.description,
      preferredDate: listing.preferredDate,
      preferredTime: listing.preferredTime,
    });
    setEditDialog({ open: true, listing });
  };

  const handleSaveEdit = async () => {
    if (!editDialog.listing) return;
    
    await updateRecyclableListingDb(editDialog.listing.id, {
      materialType: formData.materialType,
      estimatedWeight: parseFloat(formData.estimatedWeight),
      description: formData.description,
      preferredDate: formData.preferredDate,
      preferredTime: formData.preferredTime,
    });
    
    toast.success('Listing updated');
    setEditDialog({ open: false, listing: null });
    setFormData({
      materialType: 'plastic',
      estimatedWeight: '',
      description: '',
      preferredDate: '',
      preferredTime: '09:00',
    });
    await refreshListings();
  };

  const handleCancel = async (listingId: string) => {
    await updateRecyclableListingDb(listingId, { status: 'cancelled', cancelReason: 'Cancelled by resident' });
    toast.success('Listing cancelled');
    await refreshListings();
  };

  const handleDelete = async (listingId: string) => {
    if (confirm('Are you sure you want to delete this listing?')) {
      await deleteRecyclableListingDb(listingId);
      toast.success('Listing deleted');
      await refreshListings();
    }
  };

  const handleViewOffers = async (listing: RecyclableListing) => {
    const offers = await fetchListingOffersDb(listing.id);
    setOffersDialog({ open: true, listing, offers });
  };

  const handleAcceptOffer = async (offerId: string) => {
    await acceptPriceOfferDb(offerId);
    toast.success('Offer accepted! The recycler can now schedule the pickup.');
    setOffersDialog({ open: false, listing: null, offers: [] });
    await refreshListings();
  };

  const handleRejectOffer = async () => {
    if (!rejectDialog.offerId) return;
    await rejectPriceOfferDb(rejectDialog.offerId, rejectReason);
    toast.info('Offer rejected with feedback');
    setRejectDialog({ open: false, offerId: '' });
    setRejectReason('');
    if (offersDialog.listing) {
      const offers = await fetchListingOffersDb(offersDialog.listing.id);
      setOffersDialog({ ...offersDialog, offers });
    }
    await refreshListings();
  };

  const getStatusBadge = (status: RecyclableListing['status']) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-success/20 text-success">Available</Badge>;
      case 'offer_pending':
        return <Badge className="bg-info/20 text-info">Offer Pending</Badge>;
      case 'offer_accepted':
        return <Badge className="bg-primary/20 text-primary">Offer Accepted</Badge>;
      case 'scheduled':
        return <Badge className="bg-warning/20 text-warning-foreground">Scheduled</Badge>;
      case 'collected':
        return <Badge className="bg-primary/20 text-primary">Collected</Badge>;
      case 'completed':
        return <Badge className="bg-muted text-muted-foreground">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-destructive/20 text-destructive">Cancelled</Badge>;
    }
  };

  const getMaterialLabel = (type: string) => {
    return materialTypes.find(m => m.value === type)?.label || type;
  };

  const activeListings = listings.filter(l => 
    l.status !== 'completed' && l.status !== 'cancelled'
  );
  const completedListings = listings.filter(l => l.status === 'completed');
  const cancelledListings = listings.filter(l => l.status === 'cancelled');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Recyclables</h1>
            <p className="text-muted-foreground">List recyclable materials for pickup by recyclers</p>
          </div>
          <Button className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4" />
            List New Material
          </Button>
        </div>

        {/* New Listing Form */}
        {showForm && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Recycle className="w-5 h-5" />
                List Recyclable Materials
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Material Type</Label>
                    <select
                      value={formData.materialType}
                      onChange={(e) => setFormData({ ...formData, materialType: e.target.value as RecyclableListing['materialType'] })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      {materialTypes.map(m => (
                        <option key={m.value} value={m.value}>
                          {m.label} (Est. KES {m.pricePerKg}/kg)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Estimated Weight (kg)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="e.g., 10"
                      value={formData.estimatedWeight}
                      onChange={(e) => setFormData({ ...formData, estimatedWeight: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Describe the materials (e.g., plastic bottles, newspapers, aluminum cans)"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Preferred Pickup Date</Label>
                    <Input
                      type="date"
                      value={formData.preferredDate}
                      onChange={(e) => setFormData({ ...formData, preferredDate: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Preferred Time</Label>
                    <Input
                      type="time"
                      value={formData.preferredTime}
                      onChange={(e) => setFormData({ ...formData, preferredTime: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleUseLiveLocation}
                    disabled={isLocating}
                  >
                    <LocateFixed className="w-4 h-4" />
                    {isLocating ? 'Locating...' : (residentCoords ? 'Refresh Live Coordinates' : 'Use Live Coordinates')}
                  </Button>
                  {residentCoords && (
                    <span className="text-xs text-muted-foreground">
                      {residentCoords.lat.toFixed(6)}, {residentCoords.lng.toFixed(6)}
                    </span>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button type="submit">List for Pickup</Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Active Listings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Active Listings ({activeListings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeListings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Recycle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No active listings</p>
                <Button variant="link" onClick={() => setShowForm(true)}>
                  List your first recyclable material
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeListings.map((listing) => {
                  const offers = offersByListing[listing.id] || [];
                  const pendingOffers = offers.filter(o => o.status === 'pending');
                  const acceptedOffer = offers.find((offer) => offer.status === 'accepted');
                  const recyclerPhone = acceptedOffer?.recyclerPhone || '';
                  
                  return (
                    <div
                      key={listing.id}
                      className="p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{getMaterialLabel(listing.materialType).split(' ')[0]}</span>
                            <h3 className="font-semibold">{getMaterialLabel(listing.materialType).split(' ')[1]}</h3>
                            {getStatusBadge(listing.status)}
                            {pendingOffers.length > 0 && (
                              <Badge className="bg-info text-info-foreground animate-pulse">
                                {pendingOffers.length} offer{pendingOffers.length > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{listing.description}</p>
                          <div className="flex flex-wrap gap-4 text-sm">
                            <span className="flex items-center gap-1">
                              <Package className="w-4 h-4" />
                              {listing.estimatedWeight} kg (estimated)
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {listing.preferredDate} at {listing.preferredTime}
                            </span>
                          </div>
                          
                          {listing.status === 'offer_accepted' && listing.recyclerName && (
                            <div className="mt-3 p-3 bg-primary/10 rounded-lg">
                              <p className="text-sm font-medium text-primary">
                                Offer accepted from {listing.recyclerName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Price: KES {listing.offeredPrice} • Waiting for pickup schedule
                              </p>
                              {recyclerPhone && (
                                <p className="text-sm mt-1">
                                  <a href={`tel:${recyclerPhone}`} className="text-primary underline hover:text-primary/80">
                                    Call Recycler: {recyclerPhone}
                                  </a>
                                </p>
                              )}
                            </div>
                          )}
                          
                          {listing.status === 'scheduled' && listing.recyclerName && (
                            <div className="mt-3 p-3 bg-success/10 rounded-lg">
                              <p className="text-sm font-medium text-success">
                                Scheduled with {listing.recyclerName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {listing.scheduledDate} at {listing.scheduledTime} • KES {listing.offeredPrice}
                              </p>
                              {recyclerPhone && (
                                <p className="text-sm mt-1">
                                  <a href={`tel:${recyclerPhone}`} className="text-success underline hover:text-success/80">
                                    Call Recycler: {recyclerPhone}
                                  </a>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setViewDialog({ open: true, listing })}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          
                          {(listing.status === 'offer_pending' || pendingOffers.length > 0) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => handleViewOffers(listing)}
                            >
                              <DollarSign className="w-4 h-4" />
                              {pendingOffers.length}
                            </Button>
                          )}
                          
                          {listing.status === 'available' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEdit(listing)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => handleCancel(listing.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Listings */}
        {completedListings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                Completed ({completedListings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {completedListings.slice(0, 5).map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary/70"
                    onClick={() => setViewDialog({ open: true, listing })}
                  >
                    <div>
                      <span className="font-medium">{getMaterialLabel(listing.materialType)}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {listing.actualWeight || listing.estimatedWeight} kg
                      </span>
                      {listing.actualWeight && listing.actualWeight !== listing.estimatedWeight && (
                        <span className="text-xs text-info ml-2">
                          (Est: {listing.estimatedWeight} kg)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-success">
                        KES {listing.offeredPrice}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(listing.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cancelled Listings */}
        {cancelledListings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-muted-foreground" />
                Cancelled ({cancelledListings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {cancelledListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <span className="font-medium">{getMaterialLabel(listing.materialType)}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {listing.estimatedWeight} kg
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(listing.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, listing: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Listing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Material Type</Label>
                <select
                  value={formData.materialType}
                  onChange={(e) => setFormData({ ...formData, materialType: e.target.value as RecyclableListing['materialType'] })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {materialTypes.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Estimated Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.estimatedWeight}
                  onChange={(e) => setFormData({ ...formData, estimatedWeight: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preferred Date</Label>
                <Input
                  type="date"
                  value={formData.preferredDate}
                  onChange={(e) => setFormData({ ...formData, preferredDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Preferred Time</Label>
                <Input
                  type="time"
                  value={formData.preferredTime}
                  onChange={(e) => setFormData({ ...formData, preferredTime: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, listing: null })}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offers Dialog */}
      <Dialog open={offersDialog.open} onOpenChange={(open) => setOffersDialog({ open, listing: null, offers: [] })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Price Offers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {offersDialog.listing && (
              <div className="p-3 bg-secondary/50 rounded-lg">
                <p className="font-medium">{getMaterialLabel(offersDialog.listing.materialType)}</p>
                <p className="text-sm text-muted-foreground">
                  {offersDialog.listing.estimatedWeight} kg • {offersDialog.listing.description}
                </p>
              </div>
            )}
            
            {offersDialog.offers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No offers yet</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {offersDialog.offers.map(offer => (
                  <div 
                    key={offer.id} 
                    className={`p-4 rounded-lg border ${
                      offer.status === 'accepted' ? 'border-success bg-success/10' :
                      offer.status === 'rejected' ? 'border-muted bg-muted/50' :
                      'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{offer.recyclerName}</span>
                          {offer.status === 'accepted' && (
                            <Badge className="bg-success/20 text-success">Accepted</Badge>
                          )}
                          {offer.status === 'rejected' && (
                            <Badge className="bg-destructive/20 text-destructive">Rejected</Badge>
                          )}
                          {offer.isReOffer && (
                            <Badge variant="outline">Re-offer</Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-lg font-bold text-primary">KES {offer.offeredPrice} (Total)</p>
                          {offer.offeredPricePerKg && (
                            <p className="text-xs text-muted-foreground">
                              @ KES {offer.offeredPricePerKg}/kg × {offersDialog.listing?.estimatedWeight} kg
                            </p>
                          )}
                        </div>
                        {offer.message && (
                          <div className="mt-2 p-2 bg-secondary/50 rounded text-sm">
                            <MessageSquare className="w-3 h-3 inline mr-1" />
                            {offer.message}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(offer.createdAt).toLocaleString()}
                        </p>
                      </div>
                      
                      {offer.status === 'pending' && (
                        <div className="flex flex-col gap-2">
                          <Button size="sm" onClick={() => handleAcceptOffer(offer.id)}>
                            Accept
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setRejectDialog({ open: true, offerId: offer.id })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Offer Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => { setRejectDialog({ open, offerId: '' }); setRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Offer</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-muted-foreground text-sm">
              Optionally provide a reason so the recycler can adjust their offer.
            </p>
            <div className="space-y-2">
              <Label>Reason / Message (Optional)</Label>
              <Textarea
                placeholder="e.g., Price too low, I expected at least KES 30/kg..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog({ open: false, offerId: '' }); setRejectReason(''); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRejectOffer}>
              Reject Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog({ open, listing: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Listing Details</DialogTitle>
          </DialogHeader>
          {viewDialog.listing && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Material</p>
                  <p className="font-medium">{getMaterialLabel(viewDialog.listing.materialType)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(viewDialog.listing.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Weight</p>
                  <p className="font-medium">{viewDialog.listing.estimatedWeight} kg</p>
                </div>
                {viewDialog.listing.actualWeight && (
                  <div>
                    <p className="text-sm text-muted-foreground">Actual Weight</p>
                    <p className="font-medium">{viewDialog.listing.actualWeight} kg</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p>{viewDialog.listing.description}</p>
              </div>
              {viewDialog.listing.recyclerName && (
                <div>
                  <p className="text-sm text-muted-foreground">Recycler</p>
                  <p className="font-medium">{viewDialog.listing.recyclerName}</p>
                </div>
              )}
              {viewDialog.listing.offeredPrice && (
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="font-medium text-primary">KES {viewDialog.listing.offeredPrice}</p>
                </div>
              )}
              {viewDialog.listing.scheduledDate && (
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled Pickup</p>
                  <p className="font-medium">{viewDialog.listing.scheduledDate} at {viewDialog.listing.scheduledTime}</p>
                </div>
              )}
              {viewDialog.listing.completionNotes && (
                <div className="p-3 rounded-lg bg-success/10">
                  <p className="text-sm text-muted-foreground">Completion Notes</p>
                  <p className="text-success">{viewDialog.listing.completionNotes}</p>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Created: {new Date(viewDialog.listing.createdAt).toLocaleString()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

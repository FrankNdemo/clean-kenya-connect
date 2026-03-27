// M-Taka Local Storage Store
// Simulates backend with localStorage

export type UserRole = 'resident' | 'collector' | 'recycler' | 'authority';

// Demo accounts removed - authentication now uses persistent backend

// Location areas for matching
export const LOCATION_AREAS = [
  'Westlands, Nairobi',
  'Kilimani, Nairobi',
  'Industrial Area, Nairobi',
  'Karen, Nairobi',
  'Lavington, Nairobi',
  'Parklands, Nairobi',
  'Langata, Nairobi',
  'Embakasi, Nairobi',
  'Kasarani, Nairobi',
  'Ruaka, Nairobi',
];

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isSuperuser?: boolean;
  location: string;
  county?: string;
  rewardPoints: number;
  password?: string; // Only for registered users, not demo accounts
  createdAt: string;
}

export interface PasswordResetToken {
  email: string;
  token: string;
  expiresAt: string;
}

export interface CollectorUpdate {
  id: string;
  requestId: string;
  collectorId: string;
  collectorName: string;
  type: 'delay' | 'reschedule' | 'declined' | 'message' | 'resident_reply';
  message: string;
  newDate?: string;
  newTime?: string;
  residentId?: string;
  residentName?: string;
  createdAt: string;
}

export interface WasteRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  wasteType: 'organic' | 'recyclable' | 'hazardous' | 'general';
  date: string;
  time: string;
  location: string;
  coordinates?: { lat: number; lng: number };
  status: 'pending' | 'accepted' | 'collected' | 'completed' | 'cancelled' | 'declined';
  collectorId?: string;
  collectorName?: string;
  collectorPhone?: string;
  notes?: string;
  declineReason?: string;
  completionNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DumpingReport {
  id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  location: string;
  coordinates: { lat: number; lng: number };
  description: string;
  imageUrl?: string;
  imageData?: string; // Base64 image data for simulation
  status: 'reported' | 'investigating' | 'resolved' | 'cancelled';
  cancelReason?: string;
  resolutionNotes?: string;
  resolutionMessage?: string; // Appreciation/note message to resident
  createdAt: string;
  updatedAt?: string;
}

export interface RecyclingTransaction {
  id: string;
  recyclerId: string;
  materialType: 'plastic' | 'paper' | 'metal' | 'glass' | 'electronics';
  weight: number;
  price: number;
  source: string;
  paymentMethod: 'cash' | 'mpesa';
  mpesaCode?: string;
  listingId?: string;
  createdAt: string;
}

export interface MaterialInventory {
  id: string;
  recyclerId: string;
  materialType: 'plastic' | 'paper' | 'metal' | 'glass' | 'electronics';
  stock: number;
  totalValue: number;
  lastUpdated: string;
}

export interface PriceOffer {
  id: string;
  listingId: string;
  recyclerId: string;
  recyclerName: string;
  recyclerPhone: string;
  offeredPricePerKg: number;
  offeredPrice: number;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  rejectReason?: string;
  isReOffer?: boolean;
  createdAt: string;
}

export interface RecyclableListing {
  id: string;
  residentId: string;
  residentName: string;
  residentPhone: string;
  residentLocation: string;
  residentCoordinates?: { lat: number; lng: number };
  materialType: 'plastic' | 'paper' | 'metal' | 'glass' | 'electronics';
  estimatedWeight: number;
  actualWeight?: number;
  description: string;
  preferredDate: string;
  preferredTime: string;
  status: 'available' | 'offer_pending' | 'offer_accepted' | 'scheduled' | 'collected' | 'completed' | 'cancelled';
  recyclerId?: string;
  recyclerName?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  offeredPrice?: number;
  acceptedOfferId?: string;
  completionNotes?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RewardRedemption {
  id: string;
  userId: string;
  rewardName: string;
  pointsCost: number;
  redeemedAt: string;
}

// Initialize mock data
const initializeMockData = () => {
  // Events are now backend-driven; remove legacy local event cache.
  localStorage.removeItem('mtaka_events');
  localStorage.removeItem('mtaka_event_cancellations');

  if (!localStorage.getItem('mtaka_initialized')) {
    // Seed with a couple of realistic non-demo accounts
    const users: User[] = [
      {
        id: 'user_5',
        name: 'Peter Mwangi',
        email: 'peter@collector.co.ke',
        phone: '+254745678901',
        role: 'collector',
        location: 'Westlands, Nairobi',
        rewardPoints: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'user_6',
        name: 'Grace Wanjiru',
        email: 'grace@collector.co.ke',
        phone: '+254756789012',
        role: 'collector',
        location: 'Parklands, Nairobi',
        rewardPoints: 0,
        createdAt: new Date().toISOString(),
      },
    ];

    const wasteRequests: WasteRequest[] = [
      {
        id: 'req_1',
        userId: 'user_1',
        userName: 'Wanjiku Kamau',
        userPhone: '+254712345678',
        wasteType: 'recyclable',
        date: '2026-02-15',
        time: '09:00',
        location: 'Westlands, Nairobi',
        status: 'pending',
        notes: 'Plastic bottles and paper',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'req_2',
        userId: 'user_1',
        userName: 'Wanjiku Kamau',
        userPhone: '+254712345678',
        wasteType: 'organic',
        date: '2026-01-28',
        time: '14:00',
        location: 'Westlands, Nairobi',
        status: 'completed',
        collectorId: 'user_2',
        collectorName: 'James Odhiambo',
        completionNotes: 'Collected 5kg of organic waste',
        createdAt: new Date().toISOString(),
      },
    ];

    const reports: DumpingReport[] = [
      {
        id: 'rpt_1',
        userId: 'user_1',
        userName: 'Wanjiku Kamau',
        userPhone: '+254712345678',
        location: 'Behind Sarit Centre, Westlands',
        coordinates: { lat: -1.2635, lng: 36.8020 },
        description: 'Large pile of construction waste dumped illegally',
        status: 'reported',
        createdAt: new Date().toISOString(),
      },
    ];

    const transactions: RecyclingTransaction[] = [
      {
        id: 'txn_1',
        recyclerId: 'user_3',
        materialType: 'plastic',
        weight: 25,
        price: 500,
        source: 'Westlands Collection',
        paymentMethod: 'mpesa',
        mpesaCode: 'SHK7X9M2YP',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'txn_2',
        recyclerId: 'user_3',
        materialType: 'paper',
        weight: 40,
        price: 320,
        source: 'Kilimani Collection',
        paymentMethod: 'cash',
        createdAt: new Date().toISOString(),
      },
    ];

    const inventory: MaterialInventory[] = [
      { id: 'inv_1', recyclerId: 'user_3', materialType: 'plastic', stock: 450, totalValue: 9000, lastUpdated: new Date().toISOString() },
      { id: 'inv_2', recyclerId: 'user_3', materialType: 'paper', stock: 280, totalValue: 2240, lastUpdated: new Date().toISOString() },
      { id: 'inv_3', recyclerId: 'user_3', materialType: 'metal', stock: 120, totalValue: 4200, lastUpdated: new Date().toISOString() },
      { id: 'inv_4', recyclerId: 'user_3', materialType: 'glass', stock: 200, totalValue: 1000, lastUpdated: new Date().toISOString() },
      { id: 'inv_5', recyclerId: 'user_3', materialType: 'electronics', stock: 75, totalValue: 3750, lastUpdated: new Date().toISOString() },
    ];

    localStorage.setItem('mtaka_users', JSON.stringify(users));
    localStorage.setItem('mtaka_waste_requests', JSON.stringify(wasteRequests));
    localStorage.setItem('mtaka_reports', JSON.stringify(reports));
    localStorage.setItem('mtaka_transactions', JSON.stringify(transactions));
    localStorage.setItem('mtaka_inventory', JSON.stringify(inventory));
    localStorage.setItem('mtaka_initialized', 'true');
  }
};

initializeMockData();

// Helper functions
export const getUsers = (): User[] => {
  return JSON.parse(localStorage.getItem('mtaka_users') || '[]');
};

export const getUser = (id: string): User | undefined => {
  return getUsers().find(u => u.id === id);
};

export const getCurrentUser = (): User | null => {
  const userId = localStorage.getItem('mtaka_current_user');
  if (!userId) return null;
  return getUser(userId) || null;
};

export const setCurrentUser = (userId: string | null) => {
  if (userId) {
    localStorage.setItem('mtaka_current_user', userId);
  } else {
    localStorage.removeItem('mtaka_current_user');
  }
};

export const updateUserProfile = (userId: string, updates: Partial<User>): User | null => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === userId);
  if (index === -1) return null;
  users[index] = { ...users[index], ...updates };
  localStorage.setItem('mtaka_users', JSON.stringify(users));
  return users[index];
};

export const registerUser = (userData: Omit<User, 'id' | 'rewardPoints' | 'createdAt'> & { password: string }): User => {
  const users = getUsers();
  const existingUser = users.find(u => u.email.toLowerCase() === userData.email.toLowerCase());
  if (existingUser) {
    throw new Error('Email already registered');
  }
  const newUser: User = {
    ...userData,
    id: `user_${Date.now()}`,
    rewardPoints: 0,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  localStorage.setItem('mtaka_users', JSON.stringify(users));
  return newUser;
};

// Demo accounts removed - always return false
export const isDemoEmail = (_email: string): boolean => false;

export const loginUser = (email: string, password?: string): User | null => {
  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  
  const suspendedUsers: string[] = JSON.parse(localStorage.getItem('mtaka_suspended_users') || '[]');
  if (suspendedUsers.includes(user.id)) {
    return null;
  }
  
  if (!password || user.password !== password) {
    return null;
  }
  
  setCurrentUser(user.id);
  return user;
};

export const logoutUser = () => {
  setCurrentUser(null);
};

export const getCollectorsByLocation = (location: string): User[] => {
  const users = getUsers();
  const collectors = users.filter(u => u.role === 'collector');
  const locationArea = location.split(',')[0].trim().toLowerCase();
  return collectors.sort((a, b) => {
    const aMatch = a.location.toLowerCase().includes(locationArea) ? 0 : 1;
    const bMatch = b.location.toLowerCase().includes(locationArea) ? 0 : 1;
    return aMatch - bMatch;
  });
};

export const getRecyclersByLocation = (location: string): User[] => {
  const users = getUsers();
  const recyclers = users.filter(u => u.role === 'recycler');
  const locationArea = location.split(',')[0].trim().toLowerCase();
  return recyclers.sort((a, b) => {
    const aMatch = a.location.toLowerCase().includes(locationArea) ? 0 : 1;
    const bMatch = b.location.toLowerCase().includes(locationArea) ? 0 : 1;
    return aMatch - bMatch;
  });
};

// Password Reset
export const getPasswordResetTokens = (): PasswordResetToken[] => {
  return JSON.parse(localStorage.getItem('mtaka_reset_tokens') || '[]');
};

export const createPasswordResetToken = (email: string): string | null => {
  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  // Demo accounts removed - allow reset token for any registered account
  const token = `reset_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const tokens = getPasswordResetTokens();
  const filteredTokens = tokens.filter(t => t.email.toLowerCase() !== email.toLowerCase());
  filteredTokens.push({
    email: email.toLowerCase(),
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  localStorage.setItem('mtaka_reset_tokens', JSON.stringify(filteredTokens));
  return token;
};

export const validateResetToken = (token: string): string | null => {
  const tokens = getPasswordResetTokens();
  const tokenData = tokens.find(t => t.token === token);
  if (!tokenData) return null;
  if (new Date(tokenData.expiresAt) < new Date()) return null;
  return tokenData.email;
};

export const resetPassword = (token: string, newPassword: string): boolean => {
  const email = validateResetToken(token);
  if (!email) return false;
  const users = getUsers();
  const index = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (index === -1) return false;
  users[index].password = newPassword;
  localStorage.setItem('mtaka_users', JSON.stringify(users));
  const tokens = getPasswordResetTokens().filter(t => t.token !== token);
  localStorage.setItem('mtaka_reset_tokens', JSON.stringify(tokens));
  return true;
};

// Waste Requests
export const getWasteRequests = (): WasteRequest[] => {
  return JSON.parse(localStorage.getItem('mtaka_waste_requests') || '[]');
};

export const getUserWasteRequests = (userId: string): WasteRequest[] => {
  return getWasteRequests().filter(r => r.userId === userId);
};

export const getPendingWasteRequests = (): WasteRequest[] => {
  return getWasteRequests().filter(r => r.status === 'pending' || r.status === 'accepted');
};

export const getCollectorWasteRequests = (collectorId: string): WasteRequest[] => {
  return getWasteRequests().filter(r => r.collectorId === collectorId);
};

export const createWasteRequest = (request: Omit<WasteRequest, 'id' | 'createdAt'>): WasteRequest => {
  const requests = getWasteRequests();
  // Get the user's phone number
  const user = getUser(request.userId);
  const newRequest: WasteRequest = {
    ...request,
    userPhone: user?.phone,
    id: `req_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  requests.push(newRequest);
  localStorage.setItem('mtaka_waste_requests', JSON.stringify(requests));
  return newRequest;
};

export const updateWasteRequest = (id: string, updates: Partial<WasteRequest>): WasteRequest | null => {
  const requests = getWasteRequests();
  const index = requests.findIndex(r => r.id === id);
  if (index === -1) return null;
  requests[index] = { ...requests[index], ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem('mtaka_waste_requests', JSON.stringify(requests));
  return requests[index];
};

export const deleteWasteRequest = (id: string): boolean => {
  const requests = getWasteRequests();
  const filtered = requests.filter(r => r.id !== id);
  if (filtered.length === requests.length) return false;
  localStorage.setItem('mtaka_waste_requests', JSON.stringify(filtered));
  return true;
};

// Collector Updates
export const getCollectorUpdates = (): CollectorUpdate[] => {
  return JSON.parse(localStorage.getItem('mtaka_collector_updates') || '[]');
};

export const getRequestUpdates = (requestId: string): CollectorUpdate[] => {
  return getCollectorUpdates().filter(u => u.requestId === requestId);
};

export const createCollectorUpdate = (update: Omit<CollectorUpdate, 'id' | 'createdAt'>): CollectorUpdate => {
  const updates = getCollectorUpdates();
  const newUpdate: CollectorUpdate = {
    ...update,
    id: `upd_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  updates.push(newUpdate);
  localStorage.setItem('mtaka_collector_updates', JSON.stringify(updates));
  return newUpdate;
};

// Reports
export const getReports = (): DumpingReport[] => {
  return JSON.parse(localStorage.getItem('mtaka_reports') || '[]');
};

export const getUserReports = (userId: string): DumpingReport[] => {
  return getReports().filter(r => r.userId === userId);
};

export const createReport = (report: Omit<DumpingReport, 'id' | 'createdAt'>): DumpingReport => {
  const reports = getReports();
  const newReport: DumpingReport = {
    ...report,
    id: `rpt_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  reports.push(newReport);
  localStorage.setItem('mtaka_reports', JSON.stringify(reports));
  return newReport;
};

export const updateReport = (id: string, updates: Partial<DumpingReport>): DumpingReport | null => {
  const reports = getReports();
  const index = reports.findIndex(r => r.id === id);
  if (index === -1) return null;
  reports[index] = { ...reports[index], ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem('mtaka_reports', JSON.stringify(reports));
  return reports[index];
};

export const deleteReport = (id: string): boolean => {
  const reports = getReports();
  const filtered = reports.filter(r => r.id !== id);
  if (filtered.length === reports.length) return false;
  localStorage.setItem('mtaka_reports', JSON.stringify(filtered));
  return true;
};

// Recycling Transactions
export const getTransactions = (): RecyclingTransaction[] => {
  return JSON.parse(localStorage.getItem('mtaka_transactions') || '[]');
};

export const getRecyclerTransactions = (recyclerId: string): RecyclingTransaction[] => {
  return getTransactions().filter(t => t.recyclerId === recyclerId);
};

export const createTransaction = (transaction: Omit<RecyclingTransaction, 'id' | 'createdAt'>): RecyclingTransaction => {
  const transactions = getTransactions();
  const newTransaction: RecyclingTransaction = {
    ...transaction,
    id: `txn_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  transactions.push(newTransaction);
  localStorage.setItem('mtaka_transactions', JSON.stringify(transactions));
  updateInventory(transaction.recyclerId, transaction.materialType, transaction.weight, transaction.price);
  return newTransaction;
};

// Material Inventory
export const getInventory = (): MaterialInventory[] => {
  return JSON.parse(localStorage.getItem('mtaka_inventory') || '[]');
};

export const getRecyclerInventory = (recyclerId: string): MaterialInventory[] => {
  return getInventory().filter(i => i.recyclerId === recyclerId);
};

export const updateInventory = (
  recyclerId: string,
  materialType: RecyclingTransaction['materialType'],
  weightToAdd: number,
  valueToAdd: number
): MaterialInventory => {
  const inventory = getInventory();
  const existingIndex = inventory.findIndex(
    i => i.recyclerId === recyclerId && i.materialType === materialType
  );

  if (existingIndex !== -1) {
    inventory[existingIndex].stock += weightToAdd;
    inventory[existingIndex].totalValue += valueToAdd;
    inventory[existingIndex].lastUpdated = new Date().toISOString();
    localStorage.setItem('mtaka_inventory', JSON.stringify(inventory));
    return inventory[existingIndex];
  } else {
    const newInventory: MaterialInventory = {
      id: `inv_${Date.now()}`,
      recyclerId,
      materialType,
      stock: weightToAdd,
      totalValue: valueToAdd,
      lastUpdated: new Date().toISOString(),
    };
    inventory.push(newInventory);
    localStorage.setItem('mtaka_inventory', JSON.stringify(inventory));
    return newInventory;
  }
};

export const completeListingPickup = (
  listingId: string,
  recyclerId: string,
  paymentMethod: 'cash' | 'mpesa',
  actualWeight: number,
  mpesaCode?: string
): { transaction: RecyclingTransaction; inventory: MaterialInventory } | null => {
  const listings = getRecyclableListings();
  const listing = listings.find(l => l.id === listingId);
  if (!listing || listing.status !== 'scheduled') return null;
  
  updateRecyclableListing(listingId, { status: 'completed', actualWeight });
  
  const transaction = createTransaction({
    recyclerId,
    materialType: listing.materialType,
    weight: actualWeight,
    price: listing.offeredPrice || 0,
    source: `${listing.residentName} - ${listing.residentLocation}`,
    paymentMethod,
    mpesaCode: paymentMethod === 'mpesa' ? mpesaCode : undefined,
    listingId,
  });
  
  const inventoryItems = getRecyclerInventory(recyclerId);
  const inventory = inventoryItems.find(i => i.materialType === listing.materialType)!;
  return { transaction, inventory };
};

// Price Offers
export const getPriceOffers = (): PriceOffer[] => {
  return JSON.parse(localStorage.getItem('mtaka_price_offers') || '[]');
};

export const getListingOffers = (listingId: string): PriceOffer[] => {
  return getPriceOffers().filter(o => o.listingId === listingId);
};

export const getRecyclerOffers = (recyclerId: string): PriceOffer[] => {
  return getPriceOffers().filter(o => o.recyclerId === recyclerId);
};

export const createPriceOffer = (offer: Omit<PriceOffer, 'id' | 'status' | 'createdAt'>): PriceOffer => {
  const offers = getPriceOffers();
  const newOffer: PriceOffer = {
    ...offer,
    id: `off_${Date.now()}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  offers.push(newOffer);
  localStorage.setItem('mtaka_price_offers', JSON.stringify(offers));
  updateRecyclableListing(offer.listingId, { status: 'offer_pending' });
  return newOffer;
};

export const updatePriceOffer = (id: string, updates: Partial<PriceOffer>): PriceOffer | null => {
  const offers = getPriceOffers();
  const index = offers.findIndex(o => o.id === id);
  if (index === -1) return null;
  offers[index] = { ...offers[index], ...updates };
  localStorage.setItem('mtaka_price_offers', JSON.stringify(offers));
  return offers[index];
};

export const getRejectedOffersForListing = (listingId: string, recyclerId: string): PriceOffer[] => {
  return getPriceOffers().filter(o => 
    o.listingId === listingId && o.recyclerId === recyclerId && o.status === 'rejected'
  );
};

export const acceptOffer = (offerId: string): PriceOffer | null => {
  const offers = getPriceOffers();
  const offer = offers.find(o => o.id === offerId);
  if (!offer) return null;
  updatePriceOffer(offerId, { status: 'accepted' });
  offers.filter(o => o.listingId === offer.listingId && o.id !== offerId)
    .forEach(o => updatePriceOffer(o.id, { status: 'rejected' }));
  updateRecyclableListing(offer.listingId, { 
    status: 'offer_accepted',
    acceptedOfferId: offerId,
    recyclerId: offer.recyclerId,
    recyclerName: offer.recyclerName,
    offeredPrice: offer.offeredPrice,
  });
  return offer;
};

export const rejectOffer = (offerId: string, reason?: string): PriceOffer | null => {
  const offer = updatePriceOffer(offerId, { status: 'rejected', rejectReason: reason });
  if (offer) {
    const pendingOffers = getListingOffers(offer.listingId).filter(o => o.status === 'pending');
    if (pendingOffers.length === 0) {
      updateRecyclableListing(offer.listingId, { status: 'available' });
    }
  }
  return offer;
};

// Recyclable Listings
export const getRecyclableListings = (): RecyclableListing[] => {
  return JSON.parse(localStorage.getItem('mtaka_recyclable_listings') || '[]');
};

export const getAvailableListings = (): RecyclableListing[] => {
  return getRecyclableListings().filter(l => 
    l.status === 'available' || l.status === 'offer_pending'
  );
};

export const getResidentListings = (residentId: string): RecyclableListing[] => {
  return getRecyclableListings().filter(l => l.residentId === residentId);
};

export const getRecyclerScheduledListings = (recyclerId: string): RecyclableListing[] => {
  return getRecyclableListings().filter(l => l.recyclerId === recyclerId);
};

export const createRecyclableListing = (listing: Omit<RecyclableListing, 'id' | 'status' | 'createdAt'>): RecyclableListing => {
  const listings = getRecyclableListings();
  const newListing: RecyclableListing = {
    ...listing,
    id: `lst_${Date.now()}`,
    status: 'available',
    createdAt: new Date().toISOString(),
  };
  listings.push(newListing);
  localStorage.setItem('mtaka_recyclable_listings', JSON.stringify(listings));
  return newListing;
};

export const updateRecyclableListing = (id: string, updates: Partial<RecyclableListing>): RecyclableListing | null => {
  const listings = getRecyclableListings();
  const index = listings.findIndex(l => l.id === id);
  if (index === -1) return null;
  listings[index] = { ...listings[index], ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem('mtaka_recyclable_listings', JSON.stringify(listings));
  return listings[index];
};

export const deleteRecyclableListing = (id: string): boolean => {
  const listings = getRecyclableListings();
  const filtered = listings.filter(l => l.id !== id);
  if (filtered.length === listings.length) return false;
  localStorage.setItem('mtaka_recyclable_listings', JSON.stringify(filtered));
  return true;
};

export const scheduleRecyclablePickup = (
  listingId: string,
  recyclerId: string,
  recyclerName: string,
  scheduledDate: string,
  scheduledTime: string
): RecyclableListing | null => {
  const listing = getRecyclableListings().find(l => l.id === listingId);
  if (!listing || listing.status !== 'offer_accepted' || listing.recyclerId !== recyclerId) {
    return null;
  }
  return updateRecyclableListing(listingId, { status: 'scheduled', scheduledDate, scheduledTime });
};

// Reward Points
export const addRewardPoints = (userId: string, points: number) => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === userId);
  if (index !== -1) {
    users[index].rewardPoints += points;
    localStorage.setItem('mtaka_users', JSON.stringify(users));
  }
};

// Reward Redemptions
export const getRewardRedemptions = (userId: string): RewardRedemption[] => {
  const all: RewardRedemption[] = JSON.parse(localStorage.getItem('mtaka_reward_redemptions') || '[]');
  return all.filter(r => r.userId === userId);
};

export const redeemReward = (userId: string, rewardName: string, pointsCost: number): boolean => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === userId);
  if (index === -1 || users[index].rewardPoints < pointsCost) return false;
  
  users[index].rewardPoints -= pointsCost;
  localStorage.setItem('mtaka_users', JSON.stringify(users));
  
  const redemptions: RewardRedemption[] = JSON.parse(localStorage.getItem('mtaka_reward_redemptions') || '[]');
  redemptions.push({
    id: `rdm_${Date.now()}`,
    userId,
    rewardName,
    pointsCost,
    redeemedAt: new Date().toISOString(),
  });
  localStorage.setItem('mtaka_reward_redemptions', JSON.stringify(redemptions));
  return true;
};

// Statistics
export const getStats = () => {
  const requests = getWasteRequests();
  const reports = getReports();
  const transactions = getTransactions();
  const users = getUsers();
  const listings = getRecyclableListings();

  return {
    totalUsers: users.length,
    totalRequests: requests.length,
    pendingRequests: requests.filter(r => r.status === 'pending').length,
    completedRequests: requests.filter(r => r.status === 'completed').length,
    totalEvents: 0,
    approvedEvents: 0,
    totalReports: reports.length,
    resolvedReports: reports.filter(r => r.status === 'resolved').length,
    totalRecycled: transactions.reduce((sum, t) => sum + t.weight, 0),
    totalRecyclingValue: transactions.reduce((sum, t) => sum + t.price, 0),
    totalListings: listings.length,
    availableListings: listings.filter(l => l.status === 'available').length,
  };
};

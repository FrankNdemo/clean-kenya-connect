import {
  acceptPriceOfferApi,
  completeRecyclablePickupApi,
  createPriceOfferApi,
  createRecyclableListingApi,
  createRecyclerTransactionApi,
  deleteRecyclableListingApi,
  getMpesaPaymentApi,
  initiateRecyclerMpesaPaymentApi,
  listPriceOffersApi,
  listRecyclableListings,
  listRecyclerTransactionsApi,
  rejectPriceOfferApi,
  saveMpesaPaymentCompletionNotesApi,
  scheduleRecyclablePickupApi,
  updateRecyclableListingApi,
  waitForMpesaPaymentSettlementApi,
  type BackendMpesaPayment,
  type BackendPriceOffer,
  type BackendRecyclableListing,
  type BackendRecyclerTransaction,
} from "@/api";
import type {
  MaterialInventory,
  PriceOffer,
  RecyclableListing,
  RecyclingTransaction,
} from "@/lib/store";

const toNumberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBackendCoordinate = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(8));
};

const toListing = (row: BackendRecyclableListing): RecyclableListing => {
  const lat = toNumberOrNull(row.resident_location_lat);
  const lng = toNumberOrNull(row.resident_location_long);
  return {
    id: String(row.id),
    residentId: String(row.resident),
    residentName: row.resident_name,
    residentPhone: row.resident_phone || "",
    residentLocation: row.resident_location || "",
    residentCoordinates: lat !== null && lng !== null ? { lat, lng } : undefined,
    materialType: row.material_type,
    estimatedWeight: Number(row.estimated_weight || 0),
    actualWeight: row.actual_weight ? Number(row.actual_weight) : undefined,
    description: row.description,
    preferredDate: row.preferred_date,
    preferredTime: String(row.preferred_time || "").slice(0, 5),
    status: row.status,
    recyclerId: row.recycler ? String(row.recycler) : undefined,
    recyclerName: row.recycler_name || undefined,
    scheduledDate: row.scheduled_date || undefined,
    scheduledTime: row.scheduled_time ? String(row.scheduled_time).slice(0, 5) : undefined,
    offeredPrice: row.offered_price ? Number(row.offered_price) : undefined,
    acceptedOfferId: row.accepted_offer ? String(row.accepted_offer) : undefined,
    completionNotes: row.completion_notes || undefined,
    cancelReason: row.cancel_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toOffer = (row: BackendPriceOffer): PriceOffer => ({
  id: String(row.id),
  listingId: String(row.listing),
  recyclerId: String(row.recycler),
  recyclerName: row.recycler_name,
  recyclerPhone: row.recycler_phone || "",
  offeredPricePerKg: Number(row.offered_price_per_kg || 0),
  offeredPrice: Number(row.offered_price || 0),
  message: row.message || "",
  status: row.status,
  rejectReason: row.reject_reason || undefined,
  isReOffer: !!row.is_re_offer,
  createdAt: row.created_at,
});

const toTransaction = (row: BackendRecyclerTransaction): RecyclingTransaction => ({
  id: String(row.id),
  recyclerId: String(row.recycler),
  materialType: row.material_type,
  weight: Number(row.weight || 0),
  price: Number(row.price || 0),
  source: row.source,
  paymentMethod: row.payment_method,
  mpesaCode: row.mpesa_code || undefined,
  listingId: row.listing ? String(row.listing) : undefined,
  createdAt: row.created_at,
});

export interface RecyclerMpesaPaymentSession {
  id: string;
  status: "pending" | "success" | "failed" | "cancelled";
  amount: number;
  phoneNumber: string;
  phoneNumberMasked: string;
  checkoutRequestId: string;
  customerMessage?: string;
  responseDescription?: string;
  resultDesc?: string;
  mpesaReceiptNumber?: string;
  recyclerTransaction?: RecyclingTransaction;
}

const toRecyclerMpesaPaymentSession = (
  item: BackendMpesaPayment
): RecyclerMpesaPaymentSession => ({
  id: String(item.id),
  status: item.status,
  amount: Number(item.amount || 0),
  phoneNumber: item.phoneNumber || item.phone_number || "",
  phoneNumberMasked: item.phoneNumberMasked || "",
  checkoutRequestId: item.checkout_request_id || "",
  customerMessage: item.customerMessage || item.customer_message || undefined,
  responseDescription: item.responseDescription || item.response_description || undefined,
  resultDesc: item.resultDesc || item.result_desc || undefined,
  mpesaReceiptNumber: item.mpesaReceiptNumber || item.mpesa_receipt_number || undefined,
  recyclerTransaction: item.recyclerTransaction
    ? toTransaction(item.recyclerTransaction)
    : item.recycler_transaction
    ? toTransaction(item.recycler_transaction)
    : undefined,
});

export const fetchResidentListingsDb = async () => {
  const rows = await listRecyclableListings();
  return rows.map(toListing);
};

export const fetchRecyclerListingsDb = async () => {
  const rows = await listRecyclableListings();
  return rows.map(toListing);
};

export const createRecyclableListingDb = async (
  payload: Omit<RecyclableListing, "id" | "status" | "createdAt" | "updatedAt">
) => {
  const row = await createRecyclableListingApi({
    resident_name: payload.residentName,
    resident_phone: payload.residentPhone,
    resident_location: payload.residentLocation,
    resident_location_lat: toBackendCoordinate(payload.residentCoordinates?.lat),
    resident_location_long: toBackendCoordinate(payload.residentCoordinates?.lng),
    material_type: payload.materialType,
    estimated_weight: payload.estimatedWeight,
    description: payload.description,
    preferred_date: payload.preferredDate,
    preferred_time: payload.preferredTime,
  });
  return toListing(row);
};

export const updateRecyclableListingDb = async (
  id: string,
  updates: Partial<RecyclableListing>
) => {
  const row = await updateRecyclableListingApi(id, {
    material_type: updates.materialType,
    estimated_weight: updates.estimatedWeight,
    description: updates.description,
    preferred_date: updates.preferredDate,
    preferred_time: updates.preferredTime,
    status: updates.status,
    cancel_reason: updates.cancelReason,
  });
  return toListing(row);
};

export const deleteRecyclableListingDb = async (id: string) => {
  await deleteRecyclableListingApi(id);
};

export const fetchListingOffersDb = async (listingId: string) => {
  const rows = await listPriceOffersApi({ listing: listingId });
  return rows
    .filter((row) => String(row.listing) === String(listingId))
    .map(toOffer);
};

export const fetchRecyclerOffersDb = async () => {
  const rows = await listPriceOffersApi();
  return rows.map(toOffer);
};

export const fetchResidentOffersDb = async () => {
  const rows = await listPriceOffersApi();
  return rows.map(toOffer);
};

export const createPriceOfferDb = async (payload: Omit<PriceOffer, "id" | "status" | "createdAt">) => {
  const row = await createPriceOfferApi({
    listing: Number(payload.listingId),
    recycler_name: payload.recyclerName,
    recycler_phone: payload.recyclerPhone,
    offered_price_per_kg: payload.offeredPricePerKg,
    offered_price: payload.offeredPrice,
    message: payload.message,
    is_re_offer: payload.isReOffer,
  });
  return toOffer(row);
};

export const acceptPriceOfferDb = async (offerId: string) => {
  const row = await acceptPriceOfferApi(offerId);
  return toOffer(row);
};

export const rejectPriceOfferDb = async (offerId: string, reason?: string) => {
  const row = await rejectPriceOfferApi(offerId, reason);
  return toOffer(row);
};

export const scheduleRecyclablePickupDb = async (
  listingId: string,
  scheduledDate: string,
  scheduledTime: string
) => {
  const row = await scheduleRecyclablePickupApi(listingId, {
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
  });
  return toListing(row);
};

export const completeRecyclablePickupDb = async (
  listingId: string,
  paymentMethod: "cash" | "mpesa",
  actualWeight: number,
  mpesaCode?: string,
  completionNotes?: string
) => {
  const result = await completeRecyclablePickupApi(listingId, {
    payment_method: paymentMethod,
    actual_weight: actualWeight,
    mpesa_code: mpesaCode,
    completion_notes: completionNotes,
  });
  const tx = toTransaction(result.transaction);
  const inventory = await fetchRecyclerInventoryDb();
  const inventoryItem =
    inventory.find((item) => item.materialType === tx.materialType) ||
    ({
      id: `inv_${tx.materialType}`,
      recyclerId: tx.recyclerId,
      materialType: tx.materialType,
      stock: tx.weight,
      totalValue: tx.price,
      lastUpdated: tx.createdAt,
    } as MaterialInventory);

  return { transaction: tx, inventory: inventoryItem };
};

export const initiateRecyclerMpesaPaymentDb = async (payload: {
  listingId: string;
  actualWeight: number;
  phoneNumber?: string;
  completionNotes?: string;
}) => {
  const created = await initiateRecyclerMpesaPaymentApi(payload.listingId, {
    actual_weight: payload.actualWeight,
    phone_number: payload.phoneNumber || undefined,
    completion_notes: payload.completionNotes || "",
  });
  return toRecyclerMpesaPaymentSession(created);
};

export const getRecyclerMpesaPaymentDb = async (paymentId: string, force = false) => {
  const payment = await getMpesaPaymentApi(paymentId, { force });
  return toRecyclerMpesaPaymentSession(payment);
};

export const waitForRecyclerMpesaPaymentDb = async (
  paymentId: string,
  options?: {
    pollMs?: number;
    maxAttempts?: number;
    onUpdate?: (payment: RecyclerMpesaPaymentSession) => void;
  }
) => {
  const payment = await waitForMpesaPaymentSettlementApi(paymentId, {
    pollMs: options?.pollMs,
    maxAttempts: options?.maxAttempts,
    onUpdate: options?.onUpdate
      ? (nextPayment) => options.onUpdate?.(toRecyclerMpesaPaymentSession(nextPayment))
      : undefined,
  });
  return toRecyclerMpesaPaymentSession(payment);
};

export const saveRecyclerMpesaPaymentCompletionNotesDb = async (
  paymentId: string,
  completionNotes?: string
) => {
  const payment = await saveMpesaPaymentCompletionNotesApi(paymentId, {
    completion_notes: completionNotes || "",
  });
  return toRecyclerMpesaPaymentSession(payment);
};

export const fetchRecyclerTransactionsDb = async () => {
  const rows = await listRecyclerTransactionsApi();
  return rows.map(toTransaction);
};

export const createRecyclerTransactionDb = async (
  payload: Omit<RecyclingTransaction, "id" | "createdAt">
) => {
  const row = await createRecyclerTransactionApi({
    listing: payload.listingId ? Number(payload.listingId) : null,
    material_type: payload.materialType,
    weight: payload.weight,
    price: payload.price,
    source: payload.source,
    payment_method: payload.paymentMethod,
    mpesa_code: payload.mpesaCode,
  });
  return toTransaction(row);
};

export const fetchRecyclerInventoryDb = async (): Promise<MaterialInventory[]> => {
  const txns = await fetchRecyclerTransactionsDb();
  const buckets = new Map<string, MaterialInventory>();
  txns.forEach((tx) => {
    const existing = buckets.get(tx.materialType);
    if (existing) {
      existing.stock += tx.weight;
      existing.totalValue += tx.price;
      existing.lastUpdated = tx.createdAt > existing.lastUpdated ? tx.createdAt : existing.lastUpdated;
    } else {
      buckets.set(tx.materialType, {
        id: `inv_${tx.materialType}`,
        recyclerId: tx.recyclerId,
        materialType: tx.materialType,
        stock: tx.weight,
        totalValue: tx.price,
        lastUpdated: tx.createdAt,
      });
    }
  });
  return Array.from(buckets.values());
};

import {
  createCollectorTransactionApi,
  createCollectionUpdateApi,
  createCollectionRequest,
  deleteCollectionRequest,
  listCollectorRouteSummaryApi,
  listCollectorTransactionsApi,
  listCollectionUpdatesApi,
  listCollectionRequests,
  listUsers,
  listWasteTypes,
  updateCollectionRequest,
  type BackendCollectionUpdate,
  type BackendCollectorTransaction,
  type BackendCollectorRouteStop,
  type BackendCollectorRouteSummary,
  type BackendCollectionRequest,
} from "@/api";
import { getCountyFromLocation } from "@/lib/county";
import type { CollectorUpdate, User, WasteRequest } from "@/lib/store";

let wasteTypeIdByName: Record<string, number> | null = null;
let collectionRequestsCache: { at: number; data: WasteRequest[] } | null = null;
let collectorTransactionsCache: { at: number; data: CollectorTransaction[] } | null = null;
let collectionUpdatesCache: { at: number; data: CollectorUpdate[] } | null = null;
let collectionRequestsInFlight: Promise<WasteRequest[]> | null = null;
let collectorTransactionsInFlight: Promise<CollectorTransaction[]> | null = null;
let collectionUpdatesInFlight: Promise<CollectorUpdate[]> | null = null;

const CACHE_TTL_MS = 15_000;

const clearCollectionCaches = () => {
  collectionRequestsCache = null;
  collectorTransactionsCache = null;
  collectionUpdatesCache = null;
};

const toFrontendStatus = (
  status: BackendCollectionRequest["status"]
): WasteRequest["status"] => {
  switch (status) {
    case "pending":
      return "pending";
    case "scheduled":
    case "in_progress":
      return "accepted";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
};

const toBackendStatus = (
  status: WasteRequest["status"]
): BackendCollectionRequest["status"] => {
  switch (status) {
    case "pending":
      return "pending";
    case "accepted":
      return "scheduled";
    case "collected":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
    case "declined":
      return "cancelled";
    default:
      return "pending";
  }
};

const normalizeTime = (raw: string) => raw.slice(0, 5);

const toNumberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBackendCoordinate = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  // Backend stores coordinates as Decimal(..., decimal_places=8).
  return Number(value.toFixed(8));
};

const parseInstructions = (text?: string | null) => {
  const raw = text || "";
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  let completionNotes = "";
  let declineReason = "";
  let completedAt = "";
  const cleanNotes: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith("Completion: ")) {
      completionNotes = line.replace("Completion: ", "").trim();
      return;
    }
    if (line.startsWith("Declined reason: ")) {
      declineReason = line.replace("Declined reason: ", "").trim();
      return;
    }
    if (line.startsWith("CompletedAt: ")) {
      completedAt = line.replace("CompletedAt: ", "").trim();
      return;
    }
    cleanNotes.push(line);
  });

  return {
    notes: cleanNotes.join("\n"),
    completionNotes,
    declineReason,
    completedAt,
  };
};

const toFrontendRequest = (item: BackendCollectionRequest): WasteRequest => {
  const parsed = parseInstructions(item.instructions);
  const wasteTypeName = (item.waste_type_name || "").toLowerCase();
  const mappedWasteType: WasteRequest["wasteType"] =
    wasteTypeName.includes("organic")
      ? "organic"
      : wasteTypeName.includes("hazard")
        ? "hazardous"
        : wasteTypeName.includes("recycl")
          ? "recyclable"
          : "general";
  const lat = toNumberOrNull(item.address_lat);
  const lng = toNumberOrNull(item.address_long);

  return {
    id: String(item.id),
    userId: String(item.household_user_id ?? item.household),
    userName: item.household_name || "Resident",
    userPhone: item.household_phone || undefined,
    wasteType: mappedWasteType,
    date: item.scheduled_date,
    time: normalizeTime(item.scheduled_time || ""),
    location: item.address || "",
    coordinates: lat !== null && lng !== null ? { lat, lng } : undefined,
    status: toFrontendStatus(item.status),
    collectorId: item.collector_user_id
      ? String(item.collector_user_id)
      : item.collector
        ? String(item.collector)
        : undefined,
    collectorName: item.collector_name || undefined,
    collectorPhone: item.collector_phone || undefined,
    notes: parsed.notes,
    completionNotes: parsed.completionNotes || undefined,
    declineReason: parsed.declineReason || undefined,
    createdAt: item.created_at,
    updatedAt: parsed.completedAt || undefined,
  };
};

const toFrontendCollectionUpdate = (item: BackendCollectionUpdate): CollectorUpdate => ({
  id: String(item.id),
  requestId: String(item.requestId ?? item.collection_request),
  collectorId: item.collectorId ? String(item.collectorId) : "",
  collectorName: item.collectorName || "Collector",
  type: item.type || item.update_type || "message",
  message: item.message,
  newDate: item.newDate || item.new_date || undefined,
  newTime: item.newTime || (item.new_time ? normalizeTime(item.new_time) : undefined),
  residentId: item.residentId ? String(item.residentId) : undefined,
  residentName: item.residentName || undefined,
  createdAt: item.createdAt || item.created_at || new Date().toISOString(),
});

export interface CollectorRouteStop {
  requestId: string;
  location: string;
  userName: string;
  userPhone?: string;
  wasteType: WasteRequest["wasteType"];
  scheduledDate: string;
  scheduledTime: string;
  status: WasteRequest["status"];
  coordinates: { lat: number; lng: number };
  snappedCoordinates?: { lat: number; lng: number } | null;
  driveDistanceKm: number;
  driveDurationMin: number;
  etaMinutes: number;
  etaAt: string;
  cumulativeDistanceKm: number;
  cumulativeDriveDurationMin: number;
}

export interface CollectorRouteSummary {
  provider: string;
  configured: boolean;
  fallbackUsed: boolean;
  origin: { lat: number; lng: number; label: string; source: string };
  totalStops: number;
  totalDistanceKm: number;
  totalDriveDurationMin: number;
  serviceMinutesPerStop: number;
  estimatedTimeMin: number;
  generatedAt: string;
  notes: string[];
  route: CollectorRouteStop[];
}

const toNumber = (value: number | string) => Number(value);

const toFrontendRouteStop = (item: BackendCollectorRouteStop): CollectorRouteStop => {
  const coordinates = {
    lat: toNumber(item.coordinates.lat),
    lng: toNumber(item.coordinates.lng),
  };
  const snappedCoordinates = item.snapped_coordinates
    ? {
        lat: toNumber(item.snapped_coordinates.lat),
        lng: toNumber(item.snapped_coordinates.lng),
      }
    : null;

  return {
    requestId: String(item.request_id),
    location: item.location || "",
    userName: item.user_name || "Resident",
    userPhone: item.user_phone || undefined,
    wasteType: item.waste_type.toLowerCase().includes("organic")
      ? "organic"
      : item.waste_type.toLowerCase().includes("hazard")
        ? "hazardous"
        : item.waste_type.toLowerCase().includes("recycl")
          ? "recyclable"
          : "general",
    scheduledDate: item.scheduled_date,
    scheduledTime: normalizeTime(item.scheduled_time || ""),
    status: "accepted",
    coordinates,
    snappedCoordinates,
    driveDistanceKm: toNumber(item.drive_distance_km),
    driveDurationMin: toNumber(item.drive_duration_min),
    etaMinutes: Math.ceil(toNumber(item.eta_minutes)),
    etaAt: item.eta_at,
    cumulativeDistanceKm: toNumber(item.cumulative_distance_km),
    cumulativeDriveDurationMin: toNumber(item.cumulative_drive_duration_min),
  };
};

const toFrontendRouteSummary = (item: BackendCollectorRouteSummary): CollectorRouteSummary => ({
  provider: item.provider,
  configured: item.configured,
  fallbackUsed: Boolean(item.fallback_used),
  origin: {
    lat: toNumber(item.origin.lat),
    lng: toNumber(item.origin.lng),
    label: item.origin.label || "Route origin",
    source: item.origin.source || "unknown",
  },
  totalStops: item.total_stops,
  totalDistanceKm: toNumber(item.total_distance_km),
  totalDriveDurationMin: toNumber(item.total_drive_duration_min),
  serviceMinutesPerStop: item.service_minutes_per_stop,
  estimatedTimeMin: item.estimated_time_min,
  generatedAt: item.generated_at,
  notes: item.notes || [],
  route: (item.route || []).map(toFrontendRouteStop),
});

const ensureWasteTypeCache = async () => {
  if (wasteTypeIdByName) return wasteTypeIdByName;
  const wasteTypes = await listWasteTypes();
  wasteTypeIdByName = {};
  wasteTypes.forEach((item) => {
    wasteTypeIdByName![item.type_name.toLowerCase()] = item.id;
  });
  return wasteTypeIdByName;
};

const resolveWasteTypeId = async (wasteType: WasteRequest["wasteType"]) => {
  const map = await ensureWasteTypeCache();
  const direct = map[wasteType];
  if (direct) return direct;

  const entries = Object.entries(map);

  const aliases: Record<WasteRequest["wasteType"], string[]> = {
    organic: ["organic", "food", "garden"],
    recyclable: ["recyclable", "plastic", "paper", "metal", "glass"],
    hazardous: ["hazard", "chemical", "electronic", "e-waste", "ewaste", "battery"],
    general: ["general", "mixed", "household", "waste"],
  };

  const aliasHit = entries.find(([name]) =>
    aliases[wasteType].some((alias) => name.includes(alias))
  );
  if (aliasHit) return aliasHit[1];

  // Final fallback so scheduling still works if backend naming is unconventional.
  const first = entries[0];
  if (first) return first[1];

  throw new Error("Waste type not configured in backend");
};

export const fetchCurrentUserCollectionRequests = async (force = false): Promise<WasteRequest[]> => {
  const now = Date.now();
  if (!force && collectionRequestsCache && now - collectionRequestsCache.at < CACHE_TTL_MS) {
    return collectionRequestsCache.data;
  }
  if (!force && collectionRequestsInFlight) {
    return collectionRequestsInFlight;
  }

  collectionRequestsInFlight = listCollectionRequests({ force })
    .then((rows) => rows.map(toFrontendRequest))
    .then((mapped) => {
      collectionRequestsCache = { at: Date.now(), data: mapped };
      return mapped;
    })
    .finally(() => {
      collectionRequestsInFlight = null;
    });

  return collectionRequestsInFlight;
};

export const fetchCollectorRouteSummaryDb = async (payload: {
  originLocation?: string;
  originLat?: number;
  originLng?: number;
}, force = false): Promise<CollectorRouteSummary> => {
  return listCollectorRouteSummaryApi(
    {
      origin_location: payload.originLocation,
      origin_lat: payload.originLat,
      origin_lng: payload.originLng,
    },
    { force }
  ).then(toFrontendRouteSummary);
};

export const createWasteRequestDb = async (payload: {
  wasteType: WasteRequest["wasteType"];
  date: string;
  time: string;
  location: string;
  coordinates?: { lat: number; lng: number };
  notes?: string;
  collectorId?: string;
}) => {
  const wasteTypeId = await resolveWasteTypeId(payload.wasteType);
  const created = await createCollectionRequest({
    waste_type: wasteTypeId,
    collector: payload.collectorId ? Number(payload.collectorId) : null,
    scheduled_date: payload.date,
    scheduled_time: payload.time,
    status: "pending",
    address: payload.location,
    address_lat: toBackendCoordinate(payload.coordinates?.lat),
    address_long: toBackendCoordinate(payload.coordinates?.lng),
    instructions: payload.notes || "",
  });
  clearCollectionCaches();
  return toFrontendRequest(created);
};

export const updateWasteRequestDb = async (
  id: string,
  updates: Partial<WasteRequest>
) => {
  const completedAt =
    updates.status === "completed" ? new Date().toISOString() : "";
  const payload: Partial<{
    collector: number | null;
    scheduled_date: string;
    scheduled_time: string;
    status: BackendCollectionRequest["status"];
    address: string;
    address_lat: number;
    address_long: number;
    instructions: string;
  }> = {};

  if (updates.collectorId !== undefined) {
    payload.collector = updates.collectorId ? Number(updates.collectorId) : null;
  }
  if (updates.date) payload.scheduled_date = updates.date;
  if (updates.time) payload.scheduled_time = updates.time;
  if (updates.status) payload.status = toBackendStatus(updates.status);
  if (updates.location) payload.address = updates.location;
  if (updates.coordinates) {
    payload.address_lat = toBackendCoordinate(updates.coordinates.lat);
    payload.address_long = toBackendCoordinate(updates.coordinates.lng);
  }

  const textNotes = [
    updates.notes || "",
    updates.declineReason ? `Declined reason: ${updates.declineReason}` : "",
    updates.completionNotes ? `Completion: ${updates.completionNotes}` : "",
    completedAt ? `CompletedAt: ${completedAt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (textNotes) payload.instructions = textNotes;

  const updated = await updateCollectionRequest(id, payload);
  clearCollectionCaches();
  return toFrontendRequest(updated);
};

export const deleteWasteRequestDb = async (id: string) => {
  await deleteCollectionRequest(id);
  clearCollectionCaches();
};

export const fetchCollectorsFromDb = async (): Promise<User[]> => {
  const users = await listUsers();
  return users
    .filter((user) => user.user_type === "collector")
    .map((user) => {
      const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
      const county = user.county || getCountyFromLocation(user.location || "");
      return {
        id: String(user.id),
        name: user.company_name || fullName || user.username || user.email,
        email: user.email,
        phone: user.phone || "",
        role: "collector",
        location: user.location || county || "",
        county,
        rewardPoints: user.reward_points ?? 0,
        createdAt: "",
      } as User;
    });
};

export const fetchCollectionUpdatesDb = async (
  requestId?: string,
  force = false
): Promise<CollectorUpdate[]> => {
  const now = Date.now();
  if (!force && collectionUpdatesCache && now - collectionUpdatesCache.at < CACHE_TTL_MS) {
    return requestId
      ? collectionUpdatesCache.data.filter((item) => item.requestId === requestId)
      : collectionUpdatesCache.data;
  }
  if (!force && collectionUpdatesInFlight) {
    const pending = await collectionUpdatesInFlight;
    return requestId ? pending.filter((item) => item.requestId === requestId) : pending;
  }

  collectionUpdatesInFlight = listCollectionUpdatesApi(undefined, { force })
    .then((rows) => rows.map(toFrontendCollectionUpdate))
    .then((mapped) => {
      collectionUpdatesCache = { at: Date.now(), data: mapped };
      return mapped;
    })
    .finally(() => {
      collectionUpdatesInFlight = null;
    });

  const mapped = await collectionUpdatesInFlight;
  return requestId ? mapped.filter((item) => item.requestId === requestId) : mapped;
};

export const createCollectionUpdateDb = async (payload: {
  requestId: string;
  type: CollectorUpdate["type"];
  message: string;
}) => {
  const created = await createCollectionUpdateApi({
    collection_request: Number(payload.requestId),
    type: payload.type,
    message: payload.message,
  });
  clearCollectionCaches();
  return toFrontendCollectionUpdate(created);
};

export interface CollectorTransaction {
  id: string;
  collectionRequestId: string;
  collectorId: string;
  collectorName: string;
  residentId: string;
  residentName: string;
  location: string;
  collectionDate: string;
  collectionTime: string;
  totalWeight: number;
  totalPrice: number;
  paymentMethod: "cash" | "mpesa";
  mpesaCode?: string;
  createdAt: string;
}

const toFrontendCollectorTransaction = (
  item: BackendCollectorTransaction
): CollectorTransaction => ({
  id: String(item.id),
  collectionRequestId: String(item.collection_request),
  collectorId: String(item.collector),
  collectorName: item.collector_name,
  residentId: String(item.resident_id),
  residentName: item.resident_name,
  location: item.location,
  collectionDate: item.collection_request_date,
  collectionTime: normalizeTime(item.collection_request_time || ""),
  totalWeight: Number(item.total_weight || 0),
  totalPrice: Number(item.total_price || 0),
  paymentMethod: item.payment_method,
  mpesaCode: item.mpesa_code || undefined,
  createdAt: item.created_at,
});

export const fetchCollectorTransactionsDb = async (force = false): Promise<CollectorTransaction[]> => {
  const now = Date.now();
  if (!force && collectorTransactionsCache && now - collectorTransactionsCache.at < CACHE_TTL_MS) {
    return collectorTransactionsCache.data;
  }
  if (!force && collectorTransactionsInFlight) {
    return collectorTransactionsInFlight;
  }

  collectorTransactionsInFlight = listCollectorTransactionsApi({ force })
    .then((rows) => rows.map(toFrontendCollectorTransaction))
    .then((mapped) => {
      collectorTransactionsCache = { at: Date.now(), data: mapped };
      return mapped;
    })
    .finally(() => {
      collectorTransactionsInFlight = null;
    });

  return collectorTransactionsInFlight;
};

export const createCollectorTransactionDb = async (payload: {
  collectionRequestId: string;
  totalWeight: number;
  totalPrice: number;
  paymentMethod: "cash" | "mpesa";
  mpesaCode?: string;
  completionNotes?: string;
}) => {
  const created = await createCollectorTransactionApi({
    collection_request: Number(payload.collectionRequestId),
    total_weight: payload.totalWeight,
    total_price: payload.totalPrice,
    payment_method: payload.paymentMethod,
    mpesa_code: payload.mpesaCode || "",
    completion_notes: payload.completionNotes || "",
  });
  clearCollectionCaches();
  return toFrontendCollectorTransaction(created);
};

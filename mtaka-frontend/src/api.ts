import axios from "axios";

const normalizeApiBaseUrl = (rawValue: unknown): string => {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const withoutTrailingSlash = withProtocol.replace(/\/+$/, "");

  if (withoutTrailingSlash.endsWith("/api/auth")) {
    return `${withoutTrailingSlash}/`;
  }

  return `${withoutTrailingSlash}/api/auth/`;
};

const defaultApiBaseUrl =
  import.meta.env.DEV
    ? "/api/auth/"
    : typeof window !== "undefined"
    ? `${window.location.origin}/api/auth/`
    : "http://127.0.0.1:8000/api/auth/";

const API = axios.create({
  baseURL: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL) || defaultApiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // ensure cookies (HttpOnly JWT) are sent
  timeout: 12000,
});

const API_GET_CACHE_TTL_MS = 20_000;
const apiGetCache = new Map<string, { expiresAt: number; value: unknown }>();
const apiGetInFlight = new Map<string, Promise<unknown>>();

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
};

const buildCacheKey = (url: string, params?: unknown) =>
  params === undefined ? url : `${url}?${stableStringify(params)}`;

const delay = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const withRetry = async <T>(fn: () => Promise<T>, retries = 2): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await delay(200 * (attempt + 1));
    }
  }
  throw lastError;
};

const invalidateGetCache = (prefixes: string[]) => {
  const normalizedPrefixes = prefixes.map((prefix) => (prefix.endsWith("/") ? prefix : `${prefix}/`));
  for (const key of apiGetCache.keys()) {
    if (normalizedPrefixes.some((prefix) => key.startsWith(prefix))) {
      apiGetCache.delete(key);
    }
  }
  for (const key of apiGetInFlight.keys()) {
    if (normalizedPrefixes.some((prefix) => key.startsWith(prefix))) {
      apiGetInFlight.delete(key);
    }
  }
};

const cachedGet = async <T>(
  url: string,
  options?: { params?: unknown; ttlMs?: number; force?: boolean }
): Promise<T> => {
  const key = buildCacheKey(url, options?.params);
  const ttlMs = options?.ttlMs ?? API_GET_CACHE_TTL_MS;
  const now = Date.now();

  if (!options?.force) {
    const cached = apiGetCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }
    const pending = apiGetInFlight.get(key);
    if (pending) {
      return (await pending) as T;
    }
  }

  const request = withRetry(() => API.get(url, { params: options?.params }), 2)
    .then((response) => {
      apiGetCache.set(key, { expiresAt: Date.now() + ttlMs, value: response.data });
      return response.data as T;
    })
    .finally(() => {
      apiGetInFlight.delete(key);
    });

  apiGetInFlight.set(key, request as Promise<unknown>);
  return request;
};

let isRefreshingToken = false;
let refreshPromise: Promise<void> | null = null;

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as any;
    const status = error?.response?.status;
    const url = String(originalRequest?.url || "");

    const isAuthEndpoint =
      url.includes("login/") ||
      url.includes("register/") ||
      url.includes("logout/") ||
      url.includes("token/refresh/");

    if (!originalRequest || status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!isRefreshingToken) {
        isRefreshingToken = true;
        refreshPromise = API.post("token/refresh/")
          .then(() => undefined)
          .finally(() => {
            isRefreshingToken = false;
            refreshPromise = null;
          });
      }

      if (refreshPromise) {
        await refreshPromise;
      }

      return API(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);

// Login function - backend expects `username` and `password`
export const loginUser = async (username: string, password: string) => {
  const response = await API.post("login/", { username, password });
  return response.data; // { user, profile }
};

export const registerUser = async (payload: Record<string, unknown>) => {
  // payload should include username, email, password, password2, user_type, phone, full_name etc.
  const response = await API.post("register/", payload);
  return response.data; // { user, profile }
};

export const getProfile = async () => {
  return cachedGet("profile/", { ttlMs: 10_000 });
};

export const updateProfile = async (payload: {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
}) => {
  const response = await API.patch("profile/", payload);
  invalidateGetCache(["profile", "users"]);
  return response.data;
};

export const logoutUser = async () => {
  const response = await API.post("logout/");
  invalidateGetCache([
    "profile",
    "events",
    "collections",
    "users",
    "suspended-users",
    "complaints",
    "recyclable-listings",
    "price-offers",
    "recycler-transactions",
    "collector-transactions",
    "dumping-reports",
  ]);
  return response.data;
};

export interface BackendEvent {
  id: number;
  title: string;
  description: string;
  type: "cleanup" | "recycling" | "awareness" | "tree-planting";
  date: string;
  time: string;
  location: string;
  organizerId: number;
  organizerName: string;
  maxParticipants: number;
  participants: number[];
  status: "pending" | "approved" | "rejected" | "ongoing" | "completed" | "expired" | "cancelled";
  rewardPoints: number;
  cancellationReason?: string | null;
  created_at: string;
}

export const listEvents = async (): Promise<BackendEvent[]> => {
  return cachedGet("events/");
};

export const listMyEvents = async (): Promise<BackendEvent[]> => {
  return cachedGet("events/my_events/");
};

export const listMyExpiredCreatedEvents = async (): Promise<BackendEvent[]> => {
  return cachedGet("events/my_expired_created/");
};

export const createEvent = async (payload: {
  title: string;
  description: string;
  type: BackendEvent["type"];
  date: string;
  time: string;
  location: string;
  maxParticipants: number;
  rewardPoints: number;
  status?: BackendEvent["status"];
}) => {
  const response = await API.post("events/", payload);
  invalidateGetCache(["events"]);
  return response.data as BackendEvent;
};

export const joinEvent = async (eventId: number) => {
  const response = await API.post(`events/${eventId}/register/`);
  invalidateGetCache(["events"]);
  return response.data;
};

export const leaveEvent = async (eventId: number) => {
  const response = await API.post(`events/${eventId}/unregister/`);
  invalidateGetCache(["events"]);
  return response.data;
};

export const cancelEvent = async (eventId: number, reason: string) => {
  const response = await API.post(`events/${eventId}/cancel/`, { reason });
  invalidateGetCache(["events"]);
  return response.data as BackendEvent;
};

export const approveEvent = async (eventId: number) => {
  const response = await API.post(`events/${eventId}/approve/`);
  invalidateGetCache(["events"]);
  return response.data as BackendEvent;
};

export const rejectEvent = async (eventId: number) => {
  const response = await API.post(`events/${eventId}/reject/`);
  invalidateGetCache(["events"]);
  return response.data as BackendEvent;
};

export const getEventParticipants = async (eventId: number) => {
  return cachedGet(`events/${eventId}/participants_list/`) as Promise<Array<{
    id: number;
    user: number;
    user_name: string;
    user_email: string;
    user_phone: string;
    event: number;
  }>>;
};

export interface BackendWasteType {
  id: number;
  type_name: string;
  description?: string | null;
  is_recyclable: boolean;
}

export interface BackendCollectionRequest {
  id: number;
  household: number;
  household_name: string;
  household_phone?: string;
  waste_type: number;
  waste_type_name: string;
  collector: number | null;
  collector_user_id?: number | null;
  collector_name: string;
  scheduled_date: string;
  scheduled_time: string;
  status: "pending" | "scheduled" | "in_progress" | "completed" | "cancelled";
  address: string;
  address_lat?: string | number | null;
  address_long?: string | number | null;
  instructions?: string | null;
  created_at: string;
}

export interface BackendUser {
  id: number;
  username: string;
  email: string;
  user_type: "household" | "collector" | "recycler" | "authority";
  phone: string;
  first_name: string;
  last_name: string;
  reward_points?: number;
  company_name?: string;
  location?: string;
}

export interface BackendSuspendedUser {
  id: number;
  user: number;
  reason?: string | null;
  suspended_at: string;
  active: boolean;
  user_info?: BackendUser;
}

export interface BackendComplaint {
  id: number;
  reporter: number | null;
  reporter_name?: string;
  reporter_email?: string;
  reporter_phone?: string;
  subject: string;
  details: string;
  phone?: string | null;
  status: "pending" | "replied" | "closed";
  reply?: string | null;
  created_at: string;
}

export const listWasteTypes = async (): Promise<BackendWasteType[]> => {
  return cachedGet("waste-types/", { ttlMs: 60_000 });
};

export const listCollectionRequests = async (): Promise<BackendCollectionRequest[]> => {
  return cachedGet("collections/");
};

export const createCollectionRequest = async (payload: {
  waste_type: number;
  collector?: number | null;
  scheduled_date: string;
  scheduled_time: string;
  status?: BackendCollectionRequest["status"];
  address: string;
  address_lat?: number;
  address_long?: number;
  instructions?: string;
}) => {
  const response = await API.post("collections/", payload);
  invalidateGetCache(["collections"]);
  return response.data as BackendCollectionRequest;
};

export const updateCollectionRequest = async (
  id: number | string,
  payload: Partial<{
    waste_type: number;
    collector: number | null;
    scheduled_date: string;
    scheduled_time: string;
    status: BackendCollectionRequest["status"];
    address: string;
    address_lat: number;
    address_long: number;
    instructions: string;
  }>
) => {
  const response = await API.patch(`collections/${id}/`, payload);
  invalidateGetCache(["collections"]);
  return response.data as BackendCollectionRequest;
};

export const deleteCollectionRequest = async (id: number | string) => {
  await API.delete(`collections/${id}/`);
  invalidateGetCache(["collections"]);
};

export const listUsers = async (): Promise<BackendUser[]> => {
  return cachedGet("users/");
};

export const listSuspendedUsersApi = async (): Promise<BackendSuspendedUser[]> => {
  return cachedGet("suspended-users/");
};

export const createSuspendedUserApi = async (payload: {
  user: number;
  reason?: string;
  active?: boolean;
}) => {
  const response = await API.post("suspended-users/", payload);
  invalidateGetCache(["suspended-users", "users"]);
  return response.data as BackendSuspendedUser;
};

export const updateSuspendedUserApi = async (
  id: number | string,
  payload: Partial<{ reason: string; active: boolean }>
) => {
  const response = await API.patch(`suspended-users/${id}/`, payload);
  invalidateGetCache(["suspended-users", "users"]);
  return response.data as BackendSuspendedUser;
};

export const listComplaintsApi = async (): Promise<BackendComplaint[]> => {
  return cachedGet("complaints/");
};

export const updateComplaintApi = async (
  id: number | string,
  payload: Partial<{
    subject: string;
    details: string;
    phone: string;
    status: BackendComplaint["status"];
    reply: string;
  }>
) => {
  const response = await API.patch(`complaints/${id}/`, payload);
  invalidateGetCache(["complaints"]);
  return response.data as BackendComplaint;
};

export const createComplaintApi = async (payload: {
  reporter?: number;
  subject: string;
  details: string;
  phone?: string;
}) => {
  const response = await API.post("complaints/", payload);
  invalidateGetCache(["complaints"]);
  return response.data as BackendComplaint;
};

export interface BackendRecyclableListing {
  id: number;
  resident: number;
  resident_name: string;
  resident_phone: string;
  resident_location: string;
  resident_location_lat?: string | number | null;
  resident_location_long?: string | number | null;
  material_type: "plastic" | "paper" | "metal" | "glass" | "electronics";
  estimated_weight: string;
  actual_weight?: string | null;
  description: string;
  preferred_date: string;
  preferred_time: string;
  status:
    | "available"
    | "offer_pending"
    | "offer_accepted"
    | "scheduled"
    | "collected"
    | "completed"
    | "cancelled";
  recycler?: number | null;
  recycler_name?: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  offered_price?: string | null;
  accepted_offer?: number | null;
  completion_notes?: string;
  cancel_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface BackendPriceOffer {
  id: number;
  listing: number;
  recycler: number;
  recycler_name: string;
  recycler_phone: string;
  offered_price_per_kg: string;
  offered_price: string;
  message: string;
  status: "pending" | "accepted" | "rejected";
  reject_reason?: string;
  is_re_offer: boolean;
  created_at: string;
}

export interface BackendRecyclerTransaction {
  id: number;
  listing?: number | null;
  recycler: number;
  material_type: "plastic" | "paper" | "metal" | "glass" | "electronics";
  weight: string;
  price: string;
  source: string;
  payment_method: "cash" | "mpesa";
  mpesa_code?: string;
  created_at: string;
}

export interface BackendCollectorTransaction {
  id: number;
  collection_request: number;
  collector: number;
  collector_name: string;
  resident_name: string;
  resident_id: number;
  location: string;
  collection_request_date: string;
  collection_request_time: string;
  total_weight: string;
  total_price: string;
  payment_method: "cash" | "mpesa";
  mpesa_code?: string;
  created_at: string;
}

export interface BackendDumpingReport {
  id: number;
  reporter: number | null;
  reporter_name?: string;
  reporter_phone?: string;
  location: string;
  location_lat?: string | number | null;
  location_long?: string | number | null;
  description: string;
  photo?: string | null;
  severity: "low" | "medium" | "high";
  status: "reported" | "investigating" | "resolved";
  is_anonymous: boolean;
  reported_at: string;
}

export const listRecyclableListings = async (): Promise<BackendRecyclableListing[]> => {
  return cachedGet("recyclable-listings/");
};

export const createRecyclableListingApi = async (payload: {
  resident_name?: string;
  resident_phone?: string;
  resident_location?: string;
  resident_location_lat?: number;
  resident_location_long?: number;
  material_type: BackendRecyclableListing["material_type"];
  estimated_weight: number;
  description: string;
  preferred_date: string;
  preferred_time: string;
}) => {
  const response = await API.post("recyclable-listings/", payload);
  invalidateGetCache(["recyclable-listings"]);
  return response.data as BackendRecyclableListing;
};

export const updateRecyclableListingApi = async (
  id: number | string,
  payload: Partial<{
    material_type: BackendRecyclableListing["material_type"];
    estimated_weight: number;
    description: string;
    preferred_date: string;
    preferred_time: string;
    status: BackendRecyclableListing["status"];
    cancel_reason: string;
  }>
) => {
  const response = await API.patch(`recyclable-listings/${id}/`, payload);
  invalidateGetCache(["recyclable-listings"]);
  return response.data as BackendRecyclableListing;
};

export const deleteRecyclableListingApi = async (id: number | string) => {
  await API.delete(`recyclable-listings/${id}/`);
  invalidateGetCache(["recyclable-listings"]);
};

export const scheduleRecyclablePickupApi = async (
  id: number | string,
  payload: { scheduled_date: string; scheduled_time: string }
) => {
  const response = await API.post(`recyclable-listings/${id}/schedule_pickup/`, payload);
  invalidateGetCache(["recyclable-listings"]);
  return response.data as BackendRecyclableListing;
};

export const completeRecyclablePickupApi = async (
  id: number | string,
  payload: {
    actual_weight?: number;
    payment_method: "cash" | "mpesa";
    mpesa_code?: string;
    completion_notes?: string;
  }
) => {
  const response = await API.post(`recyclable-listings/${id}/complete_pickup/`, payload);
  invalidateGetCache(["recyclable-listings", "recycler-transactions"]);
  return response.data as {
    listing: BackendRecyclableListing;
    transaction: BackendRecyclerTransaction;
  };
};

export const listPriceOffersApi = async (params?: { listing?: number | string }) => {
  return cachedGet("price-offers/", { params }) as Promise<BackendPriceOffer[]>;
};

export const createPriceOfferApi = async (payload: {
  listing: number;
  recycler_name?: string;
  recycler_phone?: string;
  offered_price_per_kg: number;
  offered_price: number;
  message?: string;
  is_re_offer?: boolean;
}) => {
  const response = await API.post("price-offers/", payload);
  invalidateGetCache(["price-offers", "recyclable-listings"]);
  return response.data as BackendPriceOffer;
};

export const acceptPriceOfferApi = async (offerId: number | string) => {
  const response = await API.post(`price-offers/${offerId}/accept/`);
  invalidateGetCache(["price-offers", "recyclable-listings"]);
  return response.data as BackendPriceOffer;
};

export const rejectPriceOfferApi = async (offerId: number | string, reason?: string) => {
  const response = await API.post(`price-offers/${offerId}/reject/`, { reason });
  invalidateGetCache(["price-offers", "recyclable-listings"]);
  return response.data as BackendPriceOffer;
};

export const listRecyclerTransactionsApi = async (): Promise<BackendRecyclerTransaction[]> => {
  return cachedGet("recycler-transactions/");
};

export const listDumpingReportsApi = async (): Promise<BackendDumpingReport[]> => {
  return cachedGet("dumping-reports/");
};

export const createDumpingReportApi = async (payload: {
  location: string;
  location_lat?: number;
  location_long?: number;
  description: string;
  severity?: BackendDumpingReport["severity"];
  is_anonymous?: boolean;
  photo?: File;
}) => {
  const formData = new FormData();
  formData.append("location", payload.location);
  formData.append("description", payload.description);
  formData.append("severity", payload.severity || "medium");
  if (payload.is_anonymous === true) {
    formData.append("is_anonymous", "true");
  }
  if (payload.location_lat !== undefined) {
    formData.append("location_lat", String(payload.location_lat));
  }
  if (payload.location_long !== undefined) {
    formData.append("location_long", String(payload.location_long));
  }
  if (payload.photo) {
    formData.append("photo", payload.photo);
  }
  const response = await API.post("dumping-reports/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  invalidateGetCache(["dumping-reports"]);
  return response.data as BackendDumpingReport;
};

export const updateDumpingReportApi = async (
  id: number | string,
  payload: Partial<{
    location: string;
    location_lat: number;
    location_long: number;
    description: string;
    severity: BackendDumpingReport["severity"];
    status: BackendDumpingReport["status"];
    is_anonymous: boolean;
  }>
) => {
  const response = await API.patch(`dumping-reports/${id}/`, payload);
  invalidateGetCache(["dumping-reports"]);
  return response.data as BackendDumpingReport;
};

export const deleteDumpingReportApi = async (id: number | string) => {
  await API.delete(`dumping-reports/${id}/`);
  invalidateGetCache(["dumping-reports"]);
};

export const createRecyclerTransactionApi = async (payload: {
  listing?: number | null;
  material_type: BackendRecyclerTransaction["material_type"];
  weight: number;
  price: number;
  source: string;
  payment_method: BackendRecyclerTransaction["payment_method"];
  mpesa_code?: string;
}) => {
  const response = await API.post("recycler-transactions/", payload);
  invalidateGetCache(["recycler-transactions"]);
  return response.data as BackendRecyclerTransaction;
};

export const listCollectorTransactionsApi = async (): Promise<BackendCollectorTransaction[]> => {
  return cachedGet("collector-transactions/");
};

export const createCollectorTransactionApi = async (payload: {
  collection_request: number;
  total_weight: number;
  total_price: number;
  payment_method: BackendCollectorTransaction["payment_method"];
  mpesa_code?: string;
  completion_notes?: string;
}) => {
  const response = await API.post("collector-transactions/", payload);
  invalidateGetCache(["collector-transactions", "collections"]);
  return response.data as BackendCollectorTransaction;
};

export default API;

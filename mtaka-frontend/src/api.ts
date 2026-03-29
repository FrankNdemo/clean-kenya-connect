import axios from "axios";

const AUTH_CACHE_KEY = "mtaka_auth_user_cache";
const ACCESS_TOKEN_KEY = "mtaka_access_token";
const REFRESH_TOKEN_KEY = "mtaka_refresh_token";
const AUTH_EXPIRED_EVENT = "mtaka-auth-expired";

const getPrimaryStorage = () => {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
};

const getLegacyStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const readStoredToken = (key: string) => {
  const primary = getPrimaryStorage();
  const direct = primary?.getItem(key);
  if (direct) return direct;
  return "";
};

const storeTokens = (payload?: { access?: unknown; refresh?: unknown }) => {
  const primary = getPrimaryStorage();
  const legacy = getLegacyStorage();
  if (!primary || !payload) return;

  if (typeof payload.access === "string" && payload.access.trim()) {
    primary.setItem(ACCESS_TOKEN_KEY, payload.access);
    legacy?.removeItem(ACCESS_TOKEN_KEY);
  }
  if (typeof payload.refresh === "string" && payload.refresh.trim()) {
    primary.setItem(REFRESH_TOKEN_KEY, payload.refresh);
    legacy?.removeItem(REFRESH_TOKEN_KEY);
  }
};

const clearStoredAuth = () => {
  const primary = getPrimaryStorage();
  const legacy = getLegacyStorage();
  primary?.removeItem(ACCESS_TOKEN_KEY);
  primary?.removeItem(REFRESH_TOKEN_KEY);
  primary?.removeItem(AUTH_CACHE_KEY);
  legacy?.removeItem(ACCESS_TOKEN_KEY);
  legacy?.removeItem(REFRESH_TOKEN_KEY);
  legacy?.removeItem(AUTH_CACHE_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
};

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

export const getApiOrigin = (): string => {
  const baseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL) || defaultApiBaseUrl;
  const fallbackOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8000";

  try {
    return new URL(baseUrl, fallbackOrigin).origin;
  } catch {
    return fallbackOrigin;
  }
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
const LOGIN_REQUEST_TIMEOUT_MS = 30_000;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
};

const buildCacheKey = (url: string, params?: unknown) =>
  params === undefined ? url : `${url}?${stableStringify(params)}`;

const delay = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

export const getApiErrorMessage = (error: unknown, fallback = "Something went wrong.") => {
  if (!axios.isAxiosError(error)) return fallback;

  const data = error.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const directMessageKeys = ["detail", "error", "message", "responseDescription", "resultDesc"] as const;
    for (const key of directMessageKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }

    for (const value of Object.values(record)) {
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string" && value[0].trim()) {
        return value[0];
      }
      if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>;
        for (const nestedValue of Object.values(nested)) {
          if (typeof nestedValue === "string" && nestedValue.trim()) return nestedValue;
        }
      }
    }
  }

  if (typeof error.message === "string" && error.message.trim()) return error.message;
  return fallback;
};

const appendFormValue = (formData: FormData, key: string, value: unknown) => {
  if (value === undefined || value === null || value === '') return;
  if (value instanceof File) {
    formData.append(key, value);
    return;
  }
  formData.append(key, String(value));
};

const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = 2,
  shouldRetry: (error: unknown) => boolean = () => true
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) break;
      await delay(200 * (attempt + 1));
    }
  }
  throw lastError;
};

const isTransientLoginError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;

  const axiosError = error as {
    code?: string;
    response?: { status?: number };
  };

  if (axiosError.code === "ECONNABORTED") return true;
  if (!axiosError.response) return true;

  const status = axiosError.response.status;
  return status === 408 || status === 429 || (typeof status === "number" && status >= 500);
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

API.interceptors.request.use((config) => {
  const accessToken = readStoredToken(ACCESS_TOKEN_KEY);
  if (accessToken) {
    const headers = (config.headers ?? {}) as Record<string, unknown> & { Authorization?: string };
    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    config.headers = headers as any;
  }
  return config;
});

API.interceptors.response.use(
  (response) => {
    const url = String(response?.config?.url || "");
    if (
      url.includes("login/") ||
      url.includes("register/") ||
      url.includes("token/refresh/") ||
      url.includes("password-reset/confirm/")
    ) {
      storeTokens(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error?.config as any;
    const status = error?.response?.status;
    const url = String(originalRequest?.url || "");

    const isAuthEndpoint =
      url.includes("login/") ||
      url.includes("register/") ||
      url.includes("password-reset/request/") ||
      url.includes("password-reset/validate/") ||
      url.includes("password-reset/confirm/") ||
      url.includes("logout/") ||
      url.includes("token/refresh/");

    if (!originalRequest || status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!isRefreshingToken) {
        isRefreshingToken = true;
        const refreshToken = readStoredToken(REFRESH_TOKEN_KEY);
        refreshPromise = API.post("token/refresh/", refreshToken ? { refresh: refreshToken } : {})
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
      clearStoredAuth();
      if (refreshError && typeof refreshError === "object" && "response" in refreshError) {
        const refreshAxiosError = refreshError as {
          response?: { status?: number; data?: Record<string, unknown> };
        };
        if (refreshAxiosError.response?.status === 401) {
          refreshAxiosError.response.data = {
            ...(refreshAxiosError.response.data || {}),
            detail: "Session expired. Please sign in again.",
          };
        }
      }
      return Promise.reject(refreshError);
    }
  }
);

// Login function - backend expects `username` and `password`
export const loginUser = async (username: string, password: string) => {
  const response = await withRetry(
    () => API.post("login/", { username, password }, { timeout: LOGIN_REQUEST_TIMEOUT_MS }),
    2,
    isTransientLoginError
  );
  return response.data; // { user, profile }
};

export const registerUser = async (payload: Record<string, unknown>) => {
  // payload should include username, email, password, password2, user_type, phone, full_name etc.
  const response = await API.post("register/", payload);
  return response.data; // { user, profile }
};

export const requestPasswordReset = async (email: string) => {
  const response = await API.post("password-reset/request/", { email });
  return response.data as { detail: string };
};

export const validatePasswordResetToken = async (uid: string, token: string) => {
  const response = await API.get("password-reset/validate/", {
    params: { uid, token },
  });
  return response.data as { detail: string; email: string };
};

export const completePasswordReset = async (payload: {
  uid: string;
  token: string;
  password: string;
  password2: string;
}) => {
  const response = await API.post("password-reset/confirm/", payload);
  return response.data;
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
  clearStoredAuth();
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
    "green-credits",
  ]);
  return response.data;
};

export interface BackendEvent {
  id: number;
  title: string;
  description: string;
  type: "cleanup" | "recycling" | "awareness" | "tree-planting";
  coverImageUrl?: string | null;
  cover_image?: string | null;
  date: string;
  time: string;
  location: string;
  organizerId: number;
  organizerName: string;
  maxParticipants: number;
  participantCount?: number;
  isJoined?: boolean;
  participants?: number[];
  status: "pending" | "approved" | "rejected" | "ongoing" | "completed" | "expired" | "cancelled";
  rewardPoints: number;
  cancellationReason?: string | null;
  creatorEmail?: string | null;
  creatorPhone?: string | null;
  scheduleChangeCount?: number;
  latestScheduleChange?: {
    previousDate: string;
    newDate: string;
    previousTime: string;
    newTime: string;
    reason: string;
    changedByName: string;
    changedAt: string;
  } | null;
  created_at: string;
}

type EventListParams = {
  status?: string | string[];
};

const normalizeEventListParams = (params?: EventListParams) => {
  if (!params) return undefined;

  const { status, ...rest } = params;
  return {
    ...rest,
    ...(status
      ? {
          status: Array.isArray(status) ? status.join(',') : status,
        }
      : {}),
  };
};

export const listEvents = async (params?: EventListParams): Promise<BackendEvent[]> => {
  return cachedGet("events/", {
    params: normalizeEventListParams(params),
    ttlMs: 60_000,
  });
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
  coverImage?: File | null;
}) => {
  const formData = new FormData();
  appendFormValue(formData, "title", payload.title);
  appendFormValue(formData, "description", payload.description);
  appendFormValue(formData, "type", payload.type);
  appendFormValue(formData, "date", payload.date);
  appendFormValue(formData, "time", payload.time);
  appendFormValue(formData, "location", payload.location);
  appendFormValue(formData, "maxParticipants", payload.maxParticipants);
  appendFormValue(formData, "rewardPoints", payload.rewardPoints);
  appendFormValue(formData, "status", payload.status);
  appendFormValue(formData, "cover_image", payload.coverImage);

  const response = await API.post("events/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
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

export const deleteEvent = async (eventId: number) => {
  await API.delete(`events/${eventId}/`);
  invalidateGetCache(["events"]);
};

export const updateEventSchedule = async (
  eventId: number,
  payload: {
    date: string;
    time: string;
    scheduleChangeReason: string;
  }
) => {
  const response = await API.patch(`events/${eventId}/`, payload);
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
  household_user_id?: number;
  household_name: string;
  household_phone?: string;
  waste_type: number;
  waste_type_name: string;
  collector: number | null;
  collector_user_id?: number | null;
  collector_name: string;
  collector_phone?: string;
  scheduled_date: string;
  scheduled_time: string;
  status: "pending" | "scheduled" | "in_progress" | "completed" | "cancelled";
  address: string;
  address_lat?: string | number | null;
  address_long?: string | number | null;
  instructions?: string | null;
  created_at: string;
}

export interface BackendCollectorRouteStop {
  request_id: number;
  location: string;
  user_name: string;
  user_phone?: string;
  waste_type: string;
  scheduled_date: string;
  scheduled_time: string;
  status: BackendCollectionRequest["status"];
  coordinates: {
    lat: number | string;
    lng: number | string;
  };
  snapped_coordinates?: {
    lat: number | string;
    lng: number | string;
  } | null;
  drive_distance_km: number | string;
  drive_duration_min: number | string;
  eta_minutes: number | string;
  eta_at: string;
  cumulative_distance_km: number | string;
  cumulative_drive_duration_min: number | string;
}

export interface BackendCollectorRouteSummary {
  provider: string;
  configured: boolean;
  fallback_used: boolean;
  origin: {
    lat: number | string;
    lng: number | string;
    label: string;
    source: string;
  };
  total_stops: number;
  total_distance_km: number | string;
  total_drive_duration_min: number | string;
  service_minutes_per_stop: number;
  estimated_time_min: number;
  generated_at: string;
  notes: string[];
  route: BackendCollectorRouteStop[];
}

export interface BackendCollectionUpdate {
  id: number;
  collection_request: number;
  requestId?: number;
  sender?: number | null;
  update_type?: "delay" | "reschedule" | "declined" | "message" | "resident_reply";
  type?: "delay" | "reschedule" | "declined" | "message" | "resident_reply";
  message: string;
  new_date?: string | null;
  new_time?: string | null;
  newDate?: string | null;
  newTime?: string | null;
  collectorId?: number | null;
  collectorName?: string;
  residentId?: number;
  residentName?: string;
  created_at?: string;
  createdAt?: string;
}

export interface BackendUser {
  id: number;
  username: string;
  email: string;
  user_type: "household" | "collector" | "recycler" | "authority";
  is_superuser?: boolean;
  is_active: boolean;
  phone: string;
  first_name: string;
  last_name: string;
  reward_points?: number;
  company_name?: string;
  location?: string;
  county?: string;
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

export interface BackendGreenCredit {
  id: number;
  household: number;
  household_name?: string;
  transaction_type: "earned" | "redeemed";
  credits_amount: number;
  description: string;
  reference_id?: number | null;
  created_at: string;
}

export const listWasteTypes = async (): Promise<BackendWasteType[]> => {
  return cachedGet("waste-types/", { ttlMs: 60_000 });
};

export const listCollectionRequests = async (options?: { force?: boolean }): Promise<BackendCollectionRequest[]> => {
  return cachedGet("collections/", { force: options?.force });
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

export const listCollectorRouteSummaryApi = async (params?: {
  origin_location?: string;
  origin_lat?: number;
  origin_lng?: number;
}, options?: { force?: boolean }) => {
  return cachedGet("collections/route-summary/", {
    params,
    force: options?.force,
  }) as Promise<BackendCollectorRouteSummary>;
};

export const listCollectionUpdatesApi = async (params?: {
  collection_request?: number | string;
  request?: number | string;
}, options?: { force?: boolean }) => {
  return cachedGet("collection-updates/", { params, force: options?.force }) as Promise<BackendCollectionUpdate[]>;
};

export const createCollectionUpdateApi = async (payload: {
  collection_request: number;
  type: BackendCollectionUpdate["type"];
  message: string;
}) => {
  const response = await API.post("collection-updates/", payload);
  invalidateGetCache(["collection-updates"]);
  return response.data as BackendCollectionUpdate;
};

export const listUsers = async (): Promise<BackendUser[]> => {
  return cachedGet("users/");
};

export const updateUserPasswordApi = async (
  id: number | string,
  payload: {
    password: string;
    password2: string;
  }
) => {
  const response = await API.patch(`users/${id}/`, payload);
  invalidateGetCache(["users"]);
  return response.data as { detail: string; user: BackendUser };
};

export const deleteUserApi = async (id: number | string) => {
  await API.delete(`users/${id}/`);
  invalidateGetCache(["users"]);
};

export const resolveLocationCounty = async (location: string) => {
  const response = await API.get("location/resolve/", {
    params: { location },
  });
  return response.data as {
    location: string;
    county: string;
    resolved: boolean;
  };
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

export const listGreenCreditsApi = async (): Promise<BackendGreenCredit[]> => {
  return cachedGet("green-credits/");
};

export const redeemRewardApi = async (payload: {
  reward_name: string;
  points_cost: number;
}) => {
  const response = await API.post("green-credits/redeem/", payload);
  invalidateGetCache(["green-credits", "profile", "users"]);
  return response.data as {
    detail: string;
    emailSent: boolean;
    remainingCredits: number;
    transaction: BackendGreenCredit;
  };
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

export interface BackendMpesaPayment {
  id: number;
  payment_scope: "collector_pickup" | "recycler_pickup";
  paymentScope: "collector_pickup" | "recycler_pickup";
  status: "pending" | "success" | "failed" | "cancelled";
  amount: string;
  recorded_weight?: string | null;
  recordedWeight?: string | null;
  phone_number: string;
  phoneNumber: string;
  phoneNumberMasked: string;
  completion_notes: string;
  completionNotes: string;
  merchant_request_id: string;
  checkout_request_id: string;
  response_code: string;
  responseCode: string;
  response_description: string;
  responseDescription: string;
  customer_message: string;
  customerMessage: string;
  result_code: string;
  resultCode: string;
  result_desc: string;
  resultDesc: string;
  mpesa_receipt_number: string;
  mpesaReceiptNumber: string;
  collection_request?: number | null;
  collectionRequestId?: number | null;
  recyclable_listing?: number | null;
  recyclableListingId?: number | null;
  collector_transaction?: BackendCollectorTransaction | null;
  collectorTransaction?: BackendCollectorTransaction | null;
  recycler_transaction?: BackendRecyclerTransaction | null;
  recyclerTransaction?: BackendRecyclerTransaction | null;
  created_at: string;
  createdAt: string;
  updated_at: string;
  updatedAt: string;
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
  photo_url?: string | null;
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

export const listCollectorTransactionsApi = async (options?: { force?: boolean }): Promise<BackendCollectorTransaction[]> => {
  return cachedGet("collector-transactions/", { force: options?.force });
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

export const initiateCollectorMpesaPaymentApi = async (payload: {
  collection_request: number;
  total_weight: number;
  total_price: number;
  phone_number?: string;
  completion_notes?: string;
}) => {
  const response = await API.post("collector-transactions/mpesa/stk-push/", payload);
  invalidateGetCache(["mpesa-payments"]);
  return response.data as BackendMpesaPayment;
};

export const initiateRecyclerMpesaPaymentApi = async (
  id: number | string,
  payload: {
    actual_weight?: number;
    phone_number?: string;
    completion_notes?: string;
  }
) => {
  const response = await API.post(`recyclable-listings/${id}/mpesa/stk-push/`, payload);
  invalidateGetCache(["mpesa-payments"]);
  return response.data as BackendMpesaPayment;
};

export const getMpesaPaymentApi = async (
  id: number | string,
  options?: { force?: boolean }
): Promise<BackendMpesaPayment> => {
  return cachedGet(`mpesa-payments/${id}/`, { force: options?.force, ttlMs: 5_000 });
};

export const saveMpesaPaymentCompletionNotesApi = async (
  id: number | string,
  payload: { completion_notes?: string }
) => {
  const response = await API.post(`mpesa-payments/${id}/save-notes/`, payload);
  invalidateGetCache([
    "mpesa-payments",
    "collector-transactions",
    "recycler-transactions",
    "collections",
    "recyclable-listings",
  ]);
  return response.data as BackendMpesaPayment;
};

export const waitForMpesaPaymentSettlementApi = async (
  id: number | string,
  options?: {
    pollMs?: number;
    maxAttempts?: number;
    onUpdate?: (payment: BackendMpesaPayment) => void;
  }
): Promise<BackendMpesaPayment> => {
  const pollMs = Math.max(1000, options?.pollMs ?? 4000);
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 30);
  let latest: BackendMpesaPayment | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    latest = await getMpesaPaymentApi(id, { force: true });
    options?.onUpdate?.(latest);
    if (latest.status !== "pending") {
      if (latest.status === "success") {
        invalidateGetCache([
          "mpesa-payments",
          "collector-transactions",
          "recycler-transactions",
          "collections",
          "recyclable-listings",
        ]);
      }
      return latest;
    }

    if (attempt < maxAttempts - 1) {
      await delay(pollMs);
    }
  }

  return latest ?? getMpesaPaymentApi(id, { force: true });
};

export default API;

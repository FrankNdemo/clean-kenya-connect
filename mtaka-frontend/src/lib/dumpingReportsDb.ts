import {
  createDumpingReportApi,
  deleteDumpingReportApi,
  getApiOrigin,
  listDumpingReportsApi,
  updateDumpingReportApi,
  type BackendDumpingReport,
} from "@/api";
import type { DumpingReport } from "@/lib/store";
const META_SEPARATOR = "\n\n__mtaka_meta__";

type DumpingMeta = {
  cancelled?: boolean;
  cancelReason?: string;
  resolutionNotes?: string;
  resolutionMessage?: string;
};

const parseDescriptionWithMeta = (raw: string) => {
  const separatorIndex = raw.lastIndexOf(META_SEPARATOR);
  if (separatorIndex === -1) {
    return { description: raw, meta: {} as DumpingMeta };
  }

  const description = raw.slice(0, separatorIndex).trim();
  const metaRaw = raw.slice(separatorIndex + META_SEPARATOR.length).trim();
  try {
    const meta = JSON.parse(metaRaw) as DumpingMeta;
    return { description, meta };
  } catch {
    return { description: raw, meta: {} as DumpingMeta };
  }
};

const serializeDescriptionWithMeta = (description: string, meta: DumpingMeta) => {
  const compactMeta: DumpingMeta = {};
  if (meta.cancelled) compactMeta.cancelled = true;
  if (meta.cancelReason) compactMeta.cancelReason = meta.cancelReason;
  if (meta.resolutionNotes) compactMeta.resolutionNotes = meta.resolutionNotes;
  if (meta.resolutionMessage) compactMeta.resolutionMessage = meta.resolutionMessage;

  if (Object.keys(compactMeta).length === 0) {
    return description;
  }

  return `${description}${META_SEPARATOR}${JSON.stringify(compactMeta)}`;
};

const resolvePhotoUrl = (photo?: string | null) => {
  if (!photo) return undefined;
  const raw = String(photo).trim().replaceAll("\\", "/");
  if (!raw) return undefined;
  if (raw.startsWith("data:")) return raw;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      const normalizedPath = parsed.pathname.replaceAll("\\", "/");
      if (normalizedPath.includes("/dumping_reports/") && !normalizedPath.startsWith("/media/")) {
        return `${parsed.origin}/media${normalizedPath}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }

  const backendOrigin = getApiOrigin();
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized.startsWith("/media/")) return `${backendOrigin}${normalized}`;
  if (normalized.includes("/dumping_reports/")) return `${backendOrigin}/media${normalized}`;
  return `${backendOrigin}${normalized}`;
};

const toFrontendReport = (row: BackendDumpingReport): DumpingReport => {
  const { description, meta } = parseDescriptionWithMeta(row.description || "");
  const photoUrl = resolvePhotoUrl(row.photo_url || row.photo);

  let status: DumpingReport["status"] = row.status;
  if (meta.cancelled) {
    status = "cancelled";
  }

  const lat = Number(row.location_lat ?? 0);
  const lng = Number(row.location_long ?? 0);

  return {
    id: String(row.id),
    userId: row.reporter ? String(row.reporter) : "anonymous",
    userName: row.reporter_name || "Anonymous",
    userPhone: row.reporter_phone || "",
    location: row.location || "",
    coordinates: {
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
    },
    description,
    imageUrl: photoUrl,
    imageData: photoUrl,
    status,
    cancelReason: meta.cancelReason,
    resolutionNotes: meta.resolutionNotes,
    resolutionMessage: meta.resolutionMessage,
    createdAt: row.reported_at,
    updatedAt: row.reported_at,
  };
};

const dataUrlToFile = async (dataUrl: string, filename: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const contentType = blob.type || "image/png";
  return new File([blob], filename, { type: contentType });
};

export const fetchDumpingReportsDb = async (): Promise<DumpingReport[]> => {
  const rows = await listDumpingReportsApi();
  return rows.map(toFrontendReport);
};

export const createDumpingReportDb = async (payload: {
  location: string;
  coordinates: { lat: number; lng: number };
  description: string;
  imageData?: string;
}) => {
  const lat = Number(payload.coordinates.lat.toFixed(8));
  const lng = Number(payload.coordinates.lng.toFixed(8));
  const photoFile = payload.imageData
    ? await dataUrlToFile(payload.imageData, `dumping-${Date.now()}.png`)
    : undefined;

  const created = await createDumpingReportApi({
    location: payload.location,
    location_lat: lat,
    location_long: lng,
    description: payload.description,
    severity: "medium",
    photo: photoFile,
  });
  return toFrontendReport(created);
};

export const updateDumpingReportDb = async (
  id: string,
  updates: Partial<DumpingReport>
) => {
  const currentRows = await listDumpingReportsApi();
  const current = currentRows.find((row) => String(row.id) === String(id));
  if (!current) throw new Error("Dumping report not found");

  const parsed = parseDescriptionWithMeta(current.description || "");
  const meta: DumpingMeta = { ...parsed.meta };
  const baseDescription = updates.description ?? parsed.description;
  const payload: Partial<{
    location: string;
    location_lat: number;
    location_long: number;
    description: string;
    severity: BackendDumpingReport["severity"];
    status: BackendDumpingReport["status"];
    is_anonymous: boolean;
  }> = {};

  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.coordinates?.lat !== undefined) payload.location_lat = updates.coordinates.lat;
  if (updates.coordinates?.lng !== undefined) payload.location_long = updates.coordinates.lng;

  if (updates.cancelReason !== undefined) {
    meta.cancelReason = updates.cancelReason;
  }
  if (updates.resolutionNotes !== undefined) {
    meta.resolutionNotes = updates.resolutionNotes;
  }
  if (updates.resolutionMessage !== undefined) {
    meta.resolutionMessage = updates.resolutionMessage;
  }
  if (updates.status === "cancelled") {
    meta.cancelled = true;
    payload.status = "reported";
  } else if (updates.status === "reported" || updates.status === "investigating" || updates.status === "resolved") {
    meta.cancelled = false;
    payload.status = updates.status;
  }

  payload.description = serializeDescriptionWithMeta(baseDescription, meta);

  const updated = await updateDumpingReportApi(id, payload);
  return toFrontendReport(updated);
};

export const deleteDumpingReportDb = async (id: string) => {
  await deleteDumpingReportApi(id);
};

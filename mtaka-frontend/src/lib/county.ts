const normalizeText = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\bcounty\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toTitleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const getAuthorityCountyLabel = (value?: string | null) => {
  const normalized = normalizeText(value);
  return normalized ? toTitleCase(normalized) : "";
};

export const locationMatchesCounty = (location?: string | null, county?: string | null) => {
  const normalizedCounty = normalizeText(county);
  if (!normalizedCounty) return true;

  const normalizedLocation = normalizeText(location);
  if (!normalizedLocation) return false;

  return normalizedLocation.includes(normalizedCounty);
};

export const getCountyFromLocation = (location?: string | null) => {
  const raw = String(location || "").trim();
  if (!raw) return "";

  const withoutCountyWord = raw.replace(/\bcounty\b/gi, "").trim();
  const parts = withoutCountyWord
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const countyCandidate = parts.length > 0 ? parts[parts.length - 1] : withoutCountyWord;
  return toTitleCase(countyCandidate);
};

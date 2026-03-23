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

const COUNTY_ALIASES: Record<string, string> = {
  "nairobi": "Nairobi",
  "nairobi cbd": "Nairobi",
  "westlands": "Nairobi",
  "karen": "Nairobi",
  "kilimani": "Nairobi",
  "lavington": "Nairobi",
  "parklands": "Nairobi",
  "langata": "Nairobi",
  "embakasi": "Nairobi",
  "kasarani": "Nairobi",
  "industrial area": "Nairobi",
  "eastleigh": "Nairobi",
  "south b": "Nairobi",
  "south c": "Nairobi",
  "donholm": "Nairobi",
  "kayole": "Nairobi",
  "gikambura": "Kiambu",
  "ruaka": "Kiambu",
  "thika": "Kiambu",
  "juja": "Kiambu",
  "ruiru": "Kiambu",
  "kiambu": "Kiambu",
  "kisumu": "Kisumu",
  "kisumu county": "Kisumu",
  "kisiani": "Kisumu",
  "maseno": "Kisumu",
  "chulaimbo": "Kisumu",
  "kondele": "Kisumu",
  "mamboleo": "Kisumu",
  "nyamasaria": "Kisumu",
  "muhoroni": "Kisumu",
  "ahero": "Kisumu",
  "mombasa": "Mombasa",
  "nyali": "Mombasa",
  "bamburi": "Mombasa",
  "changamwe": "Mombasa",
  "likoni": "Mombasa",
  "nakuru": "Nakuru",
  "eldoret": "Uasin Gishu",
  "kapseret": "Uasin Gishu",
  "langas": "Uasin Gishu",
  "machakos": "Machakos",
  "syokimau": "Machakos",
  "mlolongo": "Machakos",
  "ongata rongai": "Kajiado",
  "kitengela": "Kajiado",
  "meru": "Meru",
  "embu": "Embu",
  "nyeri": "Nyeri",
  "kisii": "Kisii",
};

const COUNTY_ALIAS_ENTRIES = Object.entries(COUNTY_ALIASES).sort(
  ([left], [right]) => right.length - left.length
);
const CANONICAL_COUNTIES = Array.from(new Set(Object.values(COUNTY_ALIASES))).sort(
  (left, right) => right.length - left.length
);
const ROAD_WORDS = new Set([
  'road',
  'rd',
  'street',
  'st',
  'avenue',
  'ave',
  'lane',
  'ln',
  'drive',
  'dr',
  'highway',
  'hwy',
  'close',
  'crescent',
  'cresent',
  'way',
  'bypass',
  'expressway',
]);

const splitLocationParts = (value?: string | null) =>
  String(value || "")
    .replace(/\bcounty\b/gi, "")
    .split(/[,/;|&]+|\band\b/gi)
    .map((part) => part.trim())
    .filter(Boolean);

const normalizeCountyLabel = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const alias = COUNTY_ALIASES[normalized];
  if (alias) return alias;

  return toTitleCase(normalized);
};

const resolveCountyCandidate = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const normalizedWords = new Set(normalized.split(" "));

  const directAlias = COUNTY_ALIASES[normalized];
  if (directAlias) return directAlias;

  const partialAlias = COUNTY_ALIAS_ENTRIES.find(([alias]) => normalized === alias || normalized.includes(alias));
  if (partialAlias && [...ROAD_WORDS].every((word) => !normalizedWords.has(word))) return partialAlias[1];

  const countyMatch = CANONICAL_COUNTIES.find((county) => {
    const normalizedCounty = normalizeText(county);
    if (normalized === normalizedCounty) return true;
    if (![...ROAD_WORDS].some((word) => normalizedWords.has(word)) && normalized.startsWith(`${normalizedCounty} `)) return true;
    return false;
  });
  if (countyMatch) return countyMatch;

  return "";
};

export const getAuthorityCountyLabel = (value?: string | null) => normalizeCountyLabel(value);

export const getCountyCandidatesFromLocation = (location?: string | null) => {
  const candidates = new Set<string>();

  const addCandidate = (candidate?: string | null) => {
    const normalized = normalizeCountyLabel(candidate);
    if (normalized) {
      candidates.add(normalized);
    }
  };

  addCandidate(resolveCountyCandidate(location));

  splitLocationParts(location).forEach((part) => {
    addCandidate(resolveCountyCandidate(part));
  });

  return Array.from(candidates);
};

export const getCountyFromLocation = (location?: string | null) => {
  return getCountyCandidatesFromLocation(location)[0] || "";
};

export const locationMatchesCounty = (location?: string | null, county?: string | null) => {
  const normalizedCounty = normalizeCountyLabel(county);
  if (!normalizedCounty) return true;

  const normalizedLocation = normalizeText(location);
  if (!normalizedLocation) return false;

  const candidates = getCountyCandidatesFromLocation(location);
  if (candidates.some((candidate) => normalizeCountyLabel(candidate) === normalizedCounty)) {
    return true;
  }

  return false;
};

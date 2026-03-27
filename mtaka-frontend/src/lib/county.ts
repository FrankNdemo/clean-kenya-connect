const normalizeText = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[-_/.,;|&()]+/g, ' ')
    .replace(/\bcounty\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCountyKey = (value?: string | null) => normalizeText(value);

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const KENYA_COUNTIES = [
  'Baringo',
  'Bomet',
  'Bungoma',
  'Busia',
  'Elgeyo-Marakwet',
  'Embu',
  'Garissa',
  'Homa Bay',
  'Isiolo',
  'Kajiado',
  'Kakamega',
  'Kericho',
  'Kiambu',
  'Kilifi',
  'Kirinyaga',
  'Kisii',
  'Kisumu',
  'Kitui',
  'Kwale',
  'Laikipia',
  'Lamu',
  'Machakos',
  'Makueni',
  'Mandera',
  'Marsabit',
  'Meru',
  'Migori',
  'Mombasa',
  "Murang'a",
  'Nairobi',
  'Nakuru',
  'Nandi',
  'Narok',
  'Nyamira',
  'Nyandarua',
  'Nyeri',
  'Samburu',
  'Siaya',
  'Taita-Taveta',
  'Tana River',
  'Tharaka-Nithi',
  'Trans Nzoia',
  'Turkana',
  'Uasin Gishu',
  'Vihiga',
  'Wajir',
  'West Pokot',
] as const;

const COUNTY_ALIASES: Record<string, string> = {
  'nairobi city': 'Nairobi',
  'nairobi cbd': 'Nairobi',
  'westlands': 'Nairobi',
  'karen': 'Nairobi',
  'kilimani': 'Nairobi',
  'lavington': 'Nairobi',
  'parklands': 'Nairobi',
  'langata': 'Nairobi',
  'embakasi': 'Nairobi',
  'kasarani': 'Nairobi',
  'industrial area': 'Nairobi',
  'eastleigh': 'Nairobi',
  'south b': 'Nairobi',
  'south c': 'Nairobi',
  'donholm': 'Nairobi',
  'kayole': 'Nairobi',
  'gikambura': 'Kiambu',
  'ruaka': 'Kiambu',
  'thika': 'Kiambu',
  'juja': 'Kiambu',
  'ruiru': 'Kiambu',
  'kiambu': 'Kiambu',
  'kisumu': 'Kisumu',
  'kisiani': 'Kisumu',
  'maseno': 'Kisumu',
  'chulaimbo': 'Kisumu',
  'kondele': 'Kisumu',
  'mamboleo': 'Kisumu',
  'nyamasaria': 'Kisumu',
  'muhoroni': 'Kisumu',
  'ahero': 'Kisumu',
  'mombasa': 'Mombasa',
  'nyali': 'Mombasa',
  'bamburi': 'Mombasa',
  'changamwe': 'Mombasa',
  'likoni': 'Mombasa',
  'nakuru': 'Nakuru',
  'eldoret': 'Uasin Gishu',
  'kapseret': 'Uasin Gishu',
  'langas': 'Uasin Gishu',
  'machakos': 'Machakos',
  'syokimau': 'Machakos',
  'mlolongo': 'Machakos',
  'ongata rongai': 'Kajiado',
  'kitengela': 'Kajiado',
  'meru': 'Meru',
  'embu': 'Embu',
  'nyeri': 'Nyeri',
  'kisii': 'Kisii',
};

const COUNTY_LOOKUP = new Map<string, string>(
  KENYA_COUNTIES.map((county) => [normalizeCountyKey(county), county])
);

const COUNTY_ALIAS_LOOKUP = new Map<string, string>(
  Object.entries(COUNTY_ALIASES).map(([alias, county]) => [normalizeCountyKey(alias), county])
);

const COUNTY_ALIAS_ENTRIES = Array.from(COUNTY_ALIAS_LOOKUP.entries()).sort(
  ([left], [right]) => right.length - left.length
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
  String(value || '')
    .replace(/\r|\n/g, ' ')
    .split(/[,/;|&]+|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);

const normalizeCountyLabel = (value?: string | null) => {
  const normalized = normalizeCountyKey(value);
  if (!normalized) return '';

  const alias = COUNTY_ALIAS_LOOKUP.get(normalized);
  if (alias) return alias;

  const county = COUNTY_LOOKUP.get(normalized);
  if (county) return county;

  return toTitleCase(normalized);
};

const resolveCountyCandidate = (value?: string | null) => {
  const normalized = normalizeCountyKey(value);
  if (!normalized) return '';

  const directAlias = COUNTY_ALIAS_LOOKUP.get(normalized);
  if (directAlias) return directAlias;

  const directCounty = COUNTY_LOOKUP.get(normalized);
  if (directCounty) return directCounty;

  const normalizedWords = new Set(normalized.split(' '));
  const hasRoadWords = [...ROAD_WORDS].some((word) => normalizedWords.has(word));

  const partialAlias = COUNTY_ALIAS_ENTRIES.find(
    ([alias]) => normalized === alias || normalized.includes(alias)
  );
  if (partialAlias && !hasRoadWords) return partialAlias[1];

  const countyMatch = [...KENYA_COUNTIES].find((county) => {
    const countyKey = normalizeCountyKey(county);
    if (normalized === countyKey) return true;
    if (hasRoadWords) return false;
    return (
      normalized.startsWith(`${countyKey} `) ||
      normalized.endsWith(` ${countyKey}`) ||
      normalized.includes(` ${countyKey} `)
    );
  });

  return countyMatch || '';
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
  return getCountyCandidatesFromLocation(location)[0] || '';
};

export const locationMatchesCounty = (location?: string | null, county?: string | null) => {
  const normalizedCounty = normalizeCountyLabel(county);
  if (!normalizedCounty) return true;

  const normalizedLocation = normalizeText(location);
  if (!normalizedLocation) return false;

  const candidates = getCountyCandidatesFromLocation(location);
  return candidates.some((candidate) => normalizeCountyLabel(candidate) === normalizedCounty);
};

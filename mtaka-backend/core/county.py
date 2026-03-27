import re


def normalize_text(value):
    normalized = str(value or '').strip().lower()
    normalized = re.sub(r"[\'\u2019]", '', normalized)
    normalized = re.sub(r"[-_/.,;|&()]+", ' ', normalized)
    normalized = re.sub(r'\bcounty\b', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


def normalize_county_key(value):
    return normalize_text(value)


def to_title_case(value):
    return ' '.join(
        part[:1].upper() + part[1:]
        for part in str(value or '').split()
        if part
    )


KENYA_COUNTIES = [
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
]


COUNTY_ALIASES = {
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
}


COUNTY_LOOKUP = {normalize_county_key(county): county for county in KENYA_COUNTIES}
COUNTY_ALIAS_LOOKUP = {normalize_county_key(alias): county for alias, county in COUNTY_ALIASES.items()}
COUNTY_ALIAS_ENTRIES = sorted(COUNTY_ALIAS_LOOKUP.items(), key=lambda item: len(item[0]), reverse=True)

ROAD_WORDS = {
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
}


def split_location_parts(value):
    normalized = str(value or '').replace('\r', ' ').replace('\n', ' ')
    parts = re.split(r'[,/;|&]+|\band\b', normalized, flags=re.IGNORECASE)
    return [part.strip() for part in parts if part and part.strip()]


def normalize_county_label(value):
    normalized = normalize_county_key(value)
    if not normalized:
        return ''

    alias = COUNTY_ALIAS_LOOKUP.get(normalized)
    if alias:
        return alias

    county = COUNTY_LOOKUP.get(normalized)
    if county:
        return county

    return to_title_case(normalized)


def resolve_county_candidate(value=None):
    normalized = normalize_county_key(value)
    if not normalized:
        return ''

    direct_alias = COUNTY_ALIAS_LOOKUP.get(normalized)
    if direct_alias:
        return direct_alias

    direct_county = COUNTY_LOOKUP.get(normalized)
    if direct_county:
        return direct_county

    normalized_words = set(normalized.split())
    has_road_words = any(word in normalized_words for word in ROAD_WORDS)

    partial_alias = next(
        (
            county
            for alias, county in COUNTY_ALIAS_ENTRIES
            if normalized == alias or normalized.find(alias) != -1
        ),
        '',
    )
    if partial_alias and not has_road_words:
        return partial_alias

    county_match = next(
        (
            county
            for county in KENYA_COUNTIES
            if (
                normalized == normalize_county_key(county)
                or (
                    not has_road_words
                    and (
                        normalized.startswith(f"{normalize_county_key(county)} ")
                        or normalized.endswith(f" {normalize_county_key(county)}")
                        or normalized.find(f" {normalize_county_key(county)} ") != -1
                    )
                )
            )
        ),
        '',
    )
    if county_match:
        return county_match

    return ''


def getCountyCandidatesFromLocation(location):
    candidates = []

    def add_candidate(candidate):
        normalized = normalize_county_label(candidate)
        if normalized and normalized not in candidates:
            candidates.append(normalized)

    add_candidate(resolve_county_candidate(location))

    for part in split_location_parts(location):
        add_candidate(resolve_county_candidate(part))

    return candidates


def getCountyFromLocation(location):
    candidates = getCountyCandidatesFromLocation(location)
    return candidates[0] if candidates else ''


def resolve_county_from_location(location):
    return getCountyFromLocation(location)


def location_matches_county(location, county):
    normalized_county = normalize_county_label(county)
    if not normalized_county:
        return True

    normalized_location = normalize_text(location)
    if not normalized_location:
        return False

    candidates = getCountyCandidatesFromLocation(location)
    return any(normalize_county_label(candidate) == normalized_county for candidate in candidates)

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org"
USER_AGENT = "M-Taka county resolver/1.0"

_COUNTY_ALIASES = {
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
    "ruaka": "Kiambu",
    "gikambura": "Kiambu",
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
}

_COUNTY_ALIAS_ENTRIES = sorted(_COUNTY_ALIASES.items(), key=lambda item: len(item[0]), reverse=True)
_CANONICAL_COUNTIES = sorted(set(_COUNTY_ALIASES.values()), key=len, reverse=True)
_ROAD_WORDS = {
    "road",
    "rd",
    "street",
    "st",
    "avenue",
    "ave",
    "lane",
    "ln",
    "drive",
    "dr",
    "highway",
    "hwy",
    "close",
    "crescent",
    "cresent",
    "way",
    "bypass",
    "expressway",
}


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _normalize_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _clean_text(value).lower()).strip()


def _normalize_county_label(value: Any) -> str:
    normalized = _normalize_text(value)
    if not normalized:
        return ""
    normalized = re.sub(r"\bcounty\b", "", normalized).strip()
    if not normalized:
        return ""
    direct = _COUNTY_ALIASES.get(normalized)
    if direct:
        return direct
    return " ".join(part.capitalize() for part in normalized.split())


def _split_location_parts(value: Any) -> list[str]:
    raw = _clean_text(value)
    if not raw:
        return []
    raw = re.sub(r"\bcounty\b", "", raw, flags=re.IGNORECASE)
    parts = re.split(r"[,/;|&]+|\band\b", raw, flags=re.IGNORECASE)
    return [part.strip() for part in parts if part and part.strip()]


def _resolve_alias(value: Any) -> str:
    normalized = _normalize_text(value)
    if not normalized:
        return ""
    normalized_words = set(normalized.split())

    direct = _COUNTY_ALIASES.get(normalized)
    if direct:
        return direct

    for alias, county in _COUNTY_ALIAS_ENTRIES:
        if normalized == alias:
            return county

    if _ROAD_WORDS.isdisjoint(normalized_words):
        for alias, county in _COUNTY_ALIAS_ENTRIES:
            if alias in normalized:
                return county

    for county in _CANONICAL_COUNTIES:
        normalized_county = _normalize_text(county)
        if normalized == normalized_county:
            return county
        if _ROAD_WORDS.isdisjoint(normalized_words) and normalized.startswith(f"{normalized_county} "):
            return county

    return ""


def _fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = 15) -> Any:
    request = Request(url, headers=headers or {})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        detail = body.strip() or exc.reason or f"HTTP {exc.code}"
        raise RuntimeError(detail) from exc
    except URLError as exc:
        raise RuntimeError(str(exc.reason or "Unable to reach map service")) from exc

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Map service returned invalid JSON") from exc


def _county_from_address(address: Any) -> str:
    if not isinstance(address, dict):
        return ""

    for key in ("county", "city", "municipality", "town", "state_district", "state", "province", "region"):
        county = _normalize_county_label(address.get(key))
        if county:
            return county

    return ""


@lru_cache(maxsize=2048)
def get_county_candidates_from_location(location: str | None) -> tuple[str, ...]:
    clean = _clean_text(location)
    if not clean:
        return tuple()

    candidates: list[str] = []
    seen: set[str] = set()

    def add(candidate: str) -> None:
        normalized = _normalize_county_label(candidate)
        if normalized and normalized not in seen:
            seen.add(normalized)
            candidates.append(normalized)

    add(_resolve_alias(clean))

    for part in _split_location_parts(clean):
        add(_resolve_alias(part))

    if not candidates:
        params = urlencode(
            {
                "q": clean,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "ke",
                "addressdetails": 1,
            }
        )
        url = f"{NOMINATIM_BASE_URL}/search?{params}"
        try:
            data = _fetch_json(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept-Language": "en",
                },
            )
        except Exception:
            data = None

        if isinstance(data, list) and data:
            first = data[0]
            county = _county_from_address(first.get("address"))
            if county:
                add(county)
            display_name = _clean_text(first.get("display_name"))
            for part in reversed(_split_location_parts(display_name)):
                add(_resolve_alias(part))

    return tuple(candidates)


@lru_cache(maxsize=2048)
def resolve_county_from_location(location: str | None) -> str:
    candidates = get_county_candidates_from_location(location)
    return candidates[0] if candidates else ""


def location_matches_county(location: str | None, county: str | None) -> bool:
    normalized_county = _normalize_county_label(county)
    if not normalized_county:
        return True

    normalized_location = _normalize_text(location)
    if not normalized_location:
        return False

    candidates = get_county_candidates_from_location(location)
    if any(_normalize_county_label(candidate) == normalized_county for candidate in candidates):
        return True

    return False

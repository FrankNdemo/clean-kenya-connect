from __future__ import annotations

import json
import math
import re
from datetime import timedelta
from functools import lru_cache
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.utils import timezone

OSRM_BASE_URL = "https://router.project-osrm.org"
NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org"
USER_AGENT = "M-Taka route planner/1.0"
FALLBACK_KMH = 25.0
SERVICE_MINUTES_PER_STOP = 10

_COORD_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)")

_FALLBACK_COORDS = {
    "nairobi": {"lat": -1.286389, "lng": 36.817223},
    "nairobi cbd": {"lat": -1.286389, "lng": 36.817223},
    "kisumu": {"lat": -0.091702, "lng": 34.767956},
    "mombasa": {"lat": -4.043477, "lng": 39.668206},
    "nakuru": {"lat": -0.303099, "lng": 36.080026},
    "eldoret": {"lat": 0.514277, "lng": 35.269779},
    "siaya": {"lat": 0.061085, "lng": 34.288083},
    "nyamira": {"lat": -0.56694, "lng": 34.93412},
    "thika": {"lat": -1.03326, "lng": 37.06933},
    "machakos": {"lat": -1.5167, "lng": 37.2667},
    "kiambu": {"lat": -1.1713, "lng": 36.8356},
    "westlands": {"lat": -1.2635, "lng": 36.8020},
    "kilimani": {"lat": -1.2890, "lng": 36.7840},
    "industrial area": {"lat": -1.3100, "lng": 36.8500},
    "karen": {"lat": -1.3200, "lng": 36.7100},
    "lavington": {"lat": -1.2800, "lng": 36.7700},
    "parklands": {"lat": -1.2580, "lng": 36.8180},
    "langata": {"lat": -1.3400, "lng": 36.7500},
    "embakasi": {"lat": -1.3200, "lng": 36.9000},
    "kasarani": {"lat": -1.2200, "lng": 36.8900},
    "ruaka": {"lat": -1.2100, "lng": 36.7700},
}


class RoutePlannerError(Exception):
    pass


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _normalize_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _clean_text(value).lower()).strip()


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed


def _parse_coordinate_pair(value: Any) -> tuple[float, float] | None:
    match = _COORD_RE.search(_clean_text(value))
    if not match:
        return None
    try:
        return float(match.group(1)), float(match.group(2))
    except ValueError:
        return None


def _fallback_point(location: Any) -> dict[str, Any] | None:
    normalized = _normalize_text(location)
    if not normalized:
        return None

    for key, coords in _FALLBACK_COORDS.items():
        if normalized == key or key in normalized:
            label = _clean_text(location) or key.title()
            return {
                "lat": coords["lat"],
                "lng": coords["lng"],
                "label": label,
                "source": "fallback",
                "fallback_used": True,
            }
    return None


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
        raise RoutePlannerError(detail) from exc
    except URLError as exc:
        raise RoutePlannerError(str(exc.reason or "Unable to reach map service")) from exc

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RoutePlannerError("Map service returned invalid JSON") from exc


@lru_cache(maxsize=1024)
def lookup_location_details(location: str) -> dict[str, Any] | None:
    clean = _clean_text(location)
    if not clean:
        return None

    direct_coords = _parse_coordinate_pair(clean)
    if direct_coords:
        lat, lng = direct_coords
        return {
            "lat": lat,
            "lng": lng,
            "label": clean,
            "source": "coordinates",
            "fallback_used": False,
            "address": {},
        }

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
    except RoutePlannerError:
        fallback = _fallback_point(clean)
        if fallback is None:
            return None
        fallback["address"] = {}
        return fallback

    if isinstance(data, list) and data:
        first = data[0]
        try:
            lat = float(first["lat"])
            lng = float(first["lon"])
        except (KeyError, TypeError, ValueError):
            fallback = _fallback_point(clean)
            if fallback is None:
                return None
            fallback["address"] = {}
            return fallback
        return {
            "lat": lat,
            "lng": lng,
            "label": first.get("display_name") or clean,
            "source": "geocoded",
            "fallback_used": False,
            "address": first.get("address") if isinstance(first.get("address"), dict) else {},
        }

    fallback = _fallback_point(clean)
    if fallback is None:
        return None
    fallback["address"] = {}
    return fallback


@lru_cache(maxsize=1024)
def geocode_location(location: str) -> dict[str, Any] | None:
    return lookup_location_details(location)


def resolve_point(
    *,
    label: str | None = None,
    lat: Any | None = None,
    lng: Any | None = None,
    fallback_label: str = "Nairobi, Kenya",
) -> dict[str, Any] | None:
    clean_label = _clean_text(label)
    lat_value = _to_float(lat)
    lng_value = _to_float(lng)

    if lat_value is not None and lng_value is not None:
        return {
            "lat": lat_value,
            "lng": lng_value,
            "label": clean_label or "Live location",
            "source": "live_location",
            "fallback_used": False,
        }

    if clean_label:
        direct_coords = _parse_coordinate_pair(clean_label)
        if direct_coords:
            direct_lat, direct_lng = direct_coords
            return {
                "lat": direct_lat,
                "lng": direct_lng,
                "label": clean_label,
                "source": "coordinates",
                "fallback_used": False,
            }

        geocoded = geocode_location(clean_label)
        if geocoded is not None:
            return geocoded

    fallback = _fallback_point(fallback_label)
    if fallback is None and _normalize_text(fallback_label) != _normalize_text("Nairobi, Kenya"):
        fallback = _fallback_point("Nairobi, Kenya")
    if fallback is not None:
        fallback["label"] = clean_label or fallback_label
        return fallback

    return None


def _haversine_km(a: dict[str, Any], b: dict[str, Any]) -> float:
    radius_km = 6371.0
    lat1 = math.radians(float(a["lat"]))
    lon1 = math.radians(float(a["lng"]))
    lat2 = math.radians(float(b["lat"]))
    lon2 = math.radians(float(b["lng"]))
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    x = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def calculate_distance_km(a: dict[str, Any], b: dict[str, Any]) -> float:
    return _haversine_km(a, b)


def _build_coords(points: list[dict[str, Any]]) -> str:
    return ";".join(f'{float(point["lng"]):.6f},{float(point["lat"]):.6f}' for point in points)


def _fetch_duration_matrix(points: list[dict[str, Any]]) -> list[list[float | None]]:
    coords = _build_coords(points)
    params = urlencode({"sources": "all", "destinations": "all"})
    url = f"{OSRM_BASE_URL}/table/v1/driving/{coords}?{params}"
    data = _fetch_json(url, headers={"User-Agent": USER_AGENT})

    if data.get("code") != "Ok":
        raise RoutePlannerError(data.get("message") or "Unable to calculate route matrix")

    durations = data.get("durations")
    if not isinstance(durations, list) or not durations:
        raise RoutePlannerError("Unable to calculate route matrix")

    return durations


def _fetch_route(points: list[dict[str, Any]]) -> dict[str, Any]:
    coords = _build_coords(points)
    params = urlencode(
        {
            "overview": "false",
            "steps": "false",
            "geometries": "geojson",
        }
    )
    url = f"{OSRM_BASE_URL}/route/v1/driving/{coords}?{params}"
    data = _fetch_json(url, headers={"User-Agent": USER_AGENT})

    if data.get("code") != "Ok":
        raise RoutePlannerError(data.get("message") or "Unable to calculate route")

    routes = data.get("routes")
    if not isinstance(routes, list) or not routes:
        raise RoutePlannerError("No route found")

    return data


def _order_stop_indices(
    points: list[dict[str, Any]],
    duration_matrix: list[list[float | None]] | None = None,
) -> list[int]:
    if len(points) <= 1:
        return []

    remaining = list(range(1, len(points)))
    ordered: list[int] = []
    current_index = 0

    while remaining:
        def score(index: int) -> tuple[int, float, int]:
            matrix_value: float | None = None
            if duration_matrix and current_index < len(duration_matrix):
                row = duration_matrix[current_index]
                if index < len(row):
                    matrix_value = row[index]
            if matrix_value is None:
                return (1, _haversine_km(points[current_index], points[index]), index)
            return (0, float(matrix_value), index)

        next_index = min(remaining, key=score)
        ordered.append(next_index - 1)
        remaining.remove(next_index)
        current_index = next_index

    return ordered


def build_collector_route_summary(
    *,
    origin_location: str | None,
    origin_lat: Any | None,
    origin_lng: Any | None,
    requests: list[dict[str, Any]],
    service_minutes_per_stop: int = SERVICE_MINUTES_PER_STOP,
) -> dict[str, Any]:
    notes: list[str] = []
    origin = resolve_point(
        label=origin_location,
        lat=origin_lat,
        lng=origin_lng,
        fallback_label=origin_location or "Nairobi, Kenya",
    )
    if origin is None:
        origin = {
            "lat": -1.286389,
            "lng": 36.817223,
            "label": origin_location or "Nairobi, Kenya",
            "source": "fallback",
            "fallback_used": True,
        }
        notes.append("Origin location fell back to Nairobi CBD coordinates.")

    resolved_stops: list[dict[str, Any]] = []
    for request in requests:
        point = resolve_point(
            label=request.get("location"),
            lat=request.get("address_lat"),
            lng=request.get("address_long"),
            fallback_label=request.get("location") or "Nairobi, Kenya",
        )
        if point is None:
            notes.append(f"Skipped request {request.get('request_id')} because the location could not be resolved.")
            continue
        resolved_stops.append(
            {
                **request,
                "coordinates": {"lat": point["lat"], "lng": point["lng"]},
                "resolved_source": point["source"],
                "fallback_used": bool(point.get("fallback_used")),
            }
        )

    if not resolved_stops:
        now = timezone.now()
        return {
            "provider": "osrm",
            "configured": True,
            "fallback_used": True,
            "origin": origin,
            "total_stops": 0,
            "total_distance_km": 0.0,
            "total_drive_duration_min": 0.0,
            "service_minutes_per_stop": service_minutes_per_stop,
            "estimated_time_min": 0,
            "generated_at": now.isoformat(),
            "notes": notes or ["No assigned pickups could be mapped to a route."],
            "route": [],
        }

    if origin.get("fallback_used") or any(stop.get("fallback_used") for stop in resolved_stops):
        notes.append("Some locations were approximated with fallback coordinates.")

    points = [origin, *[stop["coordinates"] for stop in resolved_stops]]
    duration_matrix: list[list[float | None]] | None = None
    route_fallback = False
    try:
        duration_matrix = _fetch_duration_matrix(points)
    except RoutePlannerError as exc:
        notes.append(f"Road matrix lookup failed; stop ordering fell back to straight-line distances. {exc}")

    order = _order_stop_indices(points, duration_matrix)
    ordered_stops = [resolved_stops[index] for index in order]
    ordered_points = [origin, *[stop["coordinates"] for stop in ordered_stops]]

    route_payload: dict[str, Any] | None = None
    try:
        route_payload = _fetch_route(ordered_points)
    except RoutePlannerError as exc:
        notes.append(f"Road route lookup failed; using fallback estimates. {exc}")
        route_fallback = True

    now = timezone.now()
    route_stops: list[dict[str, Any]] = []
    cumulative_distance_m = 0.0
    cumulative_drive_minutes = 0.0

    if route_payload and route_payload.get("routes"):
        route = route_payload["routes"][0]
        legs = route.get("legs") or []
        waypoints = route_payload.get("waypoints") or []

        for index, stop in enumerate(ordered_stops):
            leg = legs[index] if index < len(legs) else {}
            distance_m = float(leg.get("distance") or 0.0)
            duration_s = float(leg.get("duration") or 0.0)
            cumulative_distance_m += distance_m
            cumulative_drive_minutes += duration_s / 60.0
            eta_minutes = math.ceil(cumulative_drive_minutes + (index * service_minutes_per_stop))
            eta_at = now + timedelta(minutes=eta_minutes)

            snapped_coordinates = None
            if index + 1 < len(waypoints):
                location = waypoints[index + 1].get("location") or []
                if len(location) == 2:
                    snapped_coordinates = {
                        "lat": float(location[1]),
                        "lng": float(location[0]),
                    }

            route_stops.append(
                {
                    "request_id": int(stop["request_id"]),
                    "location": stop.get("location") or "",
                    "user_name": stop.get("user_name") or "",
                    "user_phone": stop.get("user_phone") or "",
                    "waste_type": stop.get("waste_type") or "",
                    "scheduled_date": stop.get("scheduled_date") or "",
                    "scheduled_time": stop.get("scheduled_time") or "",
                    "status": stop.get("status") or "scheduled",
                    "coordinates": stop["coordinates"],
                    "snapped_coordinates": snapped_coordinates,
                    "drive_distance_km": round(distance_m / 1000.0, 2),
                    "drive_duration_min": round(duration_s / 60.0, 2),
                    "eta_minutes": eta_minutes,
                    "eta_at": eta_at.isoformat(),
                    "cumulative_distance_km": round(cumulative_distance_m / 1000.0, 2),
                    "cumulative_drive_duration_min": round(cumulative_drive_minutes, 2),
                }
            )

        total_distance_m = float(route.get("distance") or cumulative_distance_m)
        total_drive_duration_min = float(route.get("duration") or (cumulative_drive_minutes * 60.0)) / 60.0
    else:
        current_point = origin
        current_index = 0

        for index, stop in enumerate(ordered_stops):
            stop_index = order[index] + 1
            leg_distance_km = _haversine_km(current_point, stop["coordinates"])
            leg_distance_m = leg_distance_km * 1000.0
            if duration_matrix and current_index < len(duration_matrix) and stop_index < len(duration_matrix[current_index]):
                matrix_duration = duration_matrix[current_index][stop_index]
            else:
                matrix_duration = None
            if matrix_duration is None:
                duration_s = (leg_distance_km / FALLBACK_KMH) * 3600.0
            else:
                duration_s = float(matrix_duration)

            cumulative_distance_m += leg_distance_m
            cumulative_drive_minutes += duration_s / 60.0
            eta_minutes = math.ceil(cumulative_drive_minutes + (index * service_minutes_per_stop))
            eta_at = now + timedelta(minutes=eta_minutes)

            route_stops.append(
                {
                    "request_id": int(stop["request_id"]),
                    "location": stop.get("location") or "",
                    "user_name": stop.get("user_name") or "",
                    "user_phone": stop.get("user_phone") or "",
                    "waste_type": stop.get("waste_type") or "",
                    "scheduled_date": stop.get("scheduled_date") or "",
                    "scheduled_time": stop.get("scheduled_time") or "",
                    "status": stop.get("status") or "scheduled",
                    "coordinates": stop["coordinates"],
                    "snapped_coordinates": None,
                    "drive_distance_km": round(leg_distance_km, 2),
                    "drive_duration_min": round(duration_s / 60.0, 2),
                    "eta_minutes": eta_minutes,
                    "eta_at": eta_at.isoformat(),
                    "cumulative_distance_km": round(cumulative_distance_m / 1000.0, 2),
                    "cumulative_drive_duration_min": round(cumulative_drive_minutes, 2),
                }
            )

            current_point = stop["coordinates"]
            current_index = stop_index

        total_distance_m = cumulative_distance_m
        total_drive_duration_min = cumulative_drive_minutes

    estimated_time_min = math.ceil(total_drive_duration_min + (len(route_stops) * service_minutes_per_stop))

    return {
        "provider": "osrm",
        "configured": True,
        "fallback_used": route_fallback or origin.get("fallback_used") or any(stop.get("fallback_used") for stop in resolved_stops),
        "origin": origin,
        "total_stops": len(route_stops),
        "total_distance_km": round(total_distance_m / 1000.0, 2),
        "total_drive_duration_min": round(total_drive_duration_min, 2),
        "service_minutes_per_stop": service_minutes_per_stop,
        "estimated_time_min": estimated_time_min,
        "generated_at": now.isoformat(),
        "notes": notes or ["Road route data loaded successfully."],
        "route": route_stops,
    }

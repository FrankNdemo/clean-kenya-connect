import json
import logging
from email.utils import parseaddr
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail import EmailMultiAlternatives


logger = logging.getLogger(__name__)


def _uses_brevo_api() -> bool:
    return bool(getattr(settings, "BREVO_API_KEY", "").strip())


def _get_sender_identity() -> tuple[str, str]:
    sender_name, sender_email = parseaddr(getattr(settings, "DEFAULT_FROM_EMAIL", ""))
    sender_name = sender_name.strip() or "M-Taka No-Reply"
    sender_email = sender_email.strip()
    if not sender_email:
        sender_email = "no-reply@mtaka.local"
    return sender_name, sender_email


def _brevo_request_json(method: str, path: str, payload: dict | None = None) -> dict:
    api_key = str(getattr(settings, "BREVO_API_KEY", "") or "").strip()
    if not api_key:
        raise RuntimeError("Brevo email API is not configured.")

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = Request(
        f"https://api.brevo.com{path}",
        data=data,
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json",
        },
        method=method,
    )

    timeout = int(getattr(settings, "EMAIL_TIMEOUT", 20) or 20)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw_body = response.read().decode("utf-8", errors="replace").strip()
    except HTTPError as exc:
        try:
            error_body = exc.read().decode("utf-8", errors="replace").strip()
        except Exception:
            error_body = ""
        message = f"Brevo API returned HTTP {exc.code}"
        if error_body:
            message = f"{message}: {error_body}"
        raise RuntimeError(message) from exc
    except URLError as exc:
        raise RuntimeError(f"Brevo API request failed: {exc.reason}") from exc

    if not raw_body:
        return {}

    try:
        parsed = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Brevo API returned invalid JSON.") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("Brevo API returned an unexpected payload.")

    return parsed


def _get_brevo_sender_record(sender_email: str) -> dict | None:
    sender_email = str(sender_email or "").strip().lower()
    if not sender_email:
        return None

    payload = _brevo_request_json("GET", "/v3/senders")
    senders = payload.get("senders") or []
    if not isinstance(senders, list):
        raise RuntimeError("Brevo API returned an unexpected senders list.")

    for sender in senders:
        if not isinstance(sender, dict):
            continue
        current_email = str(sender.get("email", "") or "").strip().lower()
        if current_email == sender_email:
            return sender
    return None


def _get_brevo_delivery_status() -> dict:
    frontend_url = str(getattr(settings, "FRONTEND_URL", "") or "").strip()
    sender_name, sender_email = _get_sender_identity()
    api_key = str(getattr(settings, "BREVO_API_KEY", "") or "").strip()

    status_payload = {
        "provider": "brevo",
        "configured": False,
        "api_key_present": bool(api_key),
        "api_key_valid": False,
        "sender_name": sender_name,
        "sender_email": sender_email,
        "sender_id": None,
        "sender_found": False,
        "sender_active": False,
        "frontend_url_configured": bool(frontend_url),
        "notes": [],
    }

    if not api_key:
        status_payload["error"] = "Brevo API key is missing."
        status_payload["notes"] = [
            "Set DJANGO_BREVO_API_KEY in Render.",
            "Verify the sender email in Brevo before sending to other recipients.",
        ]
        return status_payload

    try:
        _brevo_request_json("GET", "/v3/account")
    except Exception as exc:
        status_payload["error"] = str(exc)
        status_payload["notes"] = [
            "Brevo rejected the API key.",
            "Generate a new Brevo API key in Brevo and update Render.",
        ]
        return status_payload

    status_payload["api_key_valid"] = True

    try:
        sender = _get_brevo_sender_record(sender_email)
    except Exception as exc:
        status_payload["error"] = str(exc)
        status_payload["notes"] = [
            "Unable to verify the sender in Brevo.",
        ]
        return status_payload

    sender_found = sender is not None
    sender_active = bool(sender and sender.get("active"))
    sender_id = sender.get("id") if sender else None
    notes = [
        "Brevo API key is present in Render.",
        "Verify the sender email in Brevo before sending to other recipients.",
    ]
    if sender_found and sender_active:
        notes = [
            "Brevo API key is present in Render.",
            "Brevo sender is active.",
        ]
    elif sender_found and not sender_active:
        notes = [
            "Brevo sender exists but is not active.",
            "Verify the sender email in Brevo before sending to other recipients.",
        ]
    elif not sender_found:
        notes = [
            "Brevo sender was not found in your account.",
            "Create or verify the sender email in Brevo.",
        ]

    status_payload.update(
        {
            "configured": bool(sender_found and sender_active),
            "sender_id": sender_id,
            "sender_found": sender_found,
            "sender_active": sender_active,
            "notes": notes,
        }
    )
    return status_payload


def email_delivery_is_configured() -> bool:
    if _uses_brevo_api():
        return bool(_get_brevo_delivery_status().get("configured"))

    backend = str(getattr(settings, "EMAIL_BACKEND", "") or "").strip().lower()
    if not backend:
        return False

    if backend.endswith("console.emailbackend") or backend.endswith("locmem.emailbackend"):
        return bool(getattr(settings, "DEBUG", False))

    if backend.endswith("smtp.emailbackend"):
        return bool(
            getattr(settings, "EMAIL_HOST", "").strip()
            and getattr(settings, "EMAIL_HOST_USER", "").strip()
            and getattr(settings, "EMAIL_HOST_PASSWORD", "").strip()
        )

    return True


def get_email_delivery_status() -> dict:
    if _uses_brevo_api():
        return _get_brevo_delivery_status()

    frontend_url = str(getattr(settings, "FRONTEND_URL", "") or "").strip()

    backend = str(getattr(settings, "EMAIL_BACKEND", "") or "").strip().lower()
    if not backend:
        return {
            "provider": "unset",
            "configured": False,
            "frontend_url_configured": bool(frontend_url),
            "notes": ["DJANGO_EMAIL_BACKEND is not set."],
        }

    if backend.endswith("console.emailbackend"):
        return {
            "provider": "console",
            "configured": bool(getattr(settings, "DEBUG", False)),
            "frontend_url_configured": bool(frontend_url),
            "notes": ["Console backend is local-only."],
        }

    if backend.endswith("locmem.emailbackend"):
        return {
            "provider": "locmem",
            "configured": bool(getattr(settings, "DEBUG", False)),
            "frontend_url_configured": bool(frontend_url),
            "notes": ["Locmem backend is local-only."],
        }

    if backend.endswith("smtp.emailbackend"):
        host = str(getattr(settings, "EMAIL_HOST", "") or "").strip()
        user = str(getattr(settings, "EMAIL_HOST_USER", "") or "").strip()
        password = str(getattr(settings, "EMAIL_HOST_PASSWORD", "") or "").strip()
        missing = [
            key
            for key, value in (
                ("DJANGO_EMAIL_HOST", host),
                ("DJANGO_EMAIL_HOST_USER", user),
                ("DJANGO_EMAIL_HOST_PASSWORD", password),
            )
            if not value
        ]
        return {
            "provider": "smtp",
            "configured": not missing,
            "frontend_url_configured": bool(frontend_url),
            "missing": missing,
            "notes": [
                "Render free does not support SMTP delivery.",
                "Use Brevo or another HTTPS email API for hosted deployments.",
            ],
        }

    return {
        "provider": backend,
        "configured": True,
        "frontend_url_configured": bool(frontend_url),
        "notes": [],
    }


def _normalize_base_url(raw_value: str) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return ""

    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"

    parsed = urlsplit(value)
    scheme = parsed.scheme or "https"
    netloc = parsed.netloc or parsed.path
    path = parsed.path if parsed.netloc else ""
    return f"{scheme}://{netloc}{path}".rstrip("/")


def get_frontend_base_url(request=None) -> str:
    configured_url = _normalize_base_url(getattr(settings, "FRONTEND_URL", ""))
    if configured_url:
        return configured_url

    if request is not None:
        origin = _normalize_base_url(request.headers.get("Origin", ""))
        if origin:
            return origin

        referer = _normalize_base_url(request.headers.get("Referer", ""))
        if referer:
            return referer

        return request.build_absolute_uri("/").rstrip("/")

    return ""


def build_password_reset_link(request, uid: str, token: str) -> str:
    base_url = get_frontend_base_url(request)
    query_string = urlencode({"uid": uid, "token": token})
    return f"{base_url}/#/reset-password?{query_string}"


def dispatch_email(send_func, *args, description: str = "email") -> None:
    try:
        send_func(*args)
    except Exception:
        logger.exception("%s delivery failed.", description)
        raise


def _send_email_via_brevo(subject: str, text_body: str, html_body: str, recipient: str) -> None:
    sender_name, sender_email = _get_sender_identity()
    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [{"email": recipient}],
        "subject": subject,
        "textContent": text_body,
        "htmlContent": html_body,
    }
    _brevo_request_json("POST", "/v3/smtp/email", payload=payload)


def _send_email(subject: str, text_body: str, html_body: str, recipient: str) -> None:
    if _uses_brevo_api():
        _send_email_via_brevo(subject, text_body, html_body, recipient)
        return

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
        headers={"X-Auto-Response-Suppress": "All"},
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)


def send_welcome_email(user) -> None:
    display_name = user.get_full_name() or user.username or "there"
    subject = "Welcome to M-Taka"
    text_body = (
        f"Hello {display_name},\n\n"
        "Welcome to M-Taka.\n\n"
        "Your account is ready, and you can now sign in to manage pickups, recyclables, "
        "reports, and other waste-management services from one place.\n\n"
        "This is an automated no-reply email from M-Taka.\n"
    )
    html_body = (
        f"<p>Hello {display_name},</p>"
        "<p>Welcome to <strong>M-Taka</strong>.</p>"
        "<p>Your account is ready, and you can now sign in to manage pickups, recyclables, "
        "reports, and other waste-management services from one place.</p>"
        "<p>This is an automated no-reply email from M-Taka.</p>"
    )
    _send_email(subject, text_body, html_body, user.email)


def send_password_reset_email(user, reset_link: str) -> None:
    display_name = user.get_full_name() or user.username or "there"
    subject = "Reset your M-Taka password"
    text_body = (
        f"Hello {display_name},\n\n"
        "We received a request to reset your M-Taka password.\n\n"
        f"Use this secure link to set a new password:\n{reset_link}\n\n"
        "If you did not request this change, you can ignore this email.\n\n"
        "This is an automated no-reply email from M-Taka.\n"
    )
    html_body = (
        f"<p>Hello {display_name},</p>"
        "<p>We received a request to reset your <strong>M-Taka</strong> password.</p>"
        f'<p><a href="{reset_link}">Click here to reset your password</a></p>'
        "<p>If you did not request this change, you can ignore this email.</p>"
        "<p>This is an automated no-reply email from M-Taka.</p>"
    )
    _send_email(subject, text_body, html_body, user.email)


def send_reward_redemption_email(user, reward_name: str, points_cost: int) -> None:
    display_name = user.get_full_name() or user.username or "there"
    safe_reward_name = str(reward_name or "your selected reward").strip() or "your selected reward"
    subject = "Your M-Taka reward redemption request was received"
    text_body = (
        f"Hello {display_name},\n\n"
        f"We received your M-Taka reward redemption request for {safe_reward_name}.\n"
        f"Points used: {points_cost}\n\n"
        "Your reward will be processed, and our team will contact you using your registered email or phone.\n\n"
        "This is an automated no-reply email from M-Taka.\n"
    )
    html_body = (
        f"<p>Hello {display_name},</p>"
        f"<p>We received your <strong>M-Taka</strong> reward redemption request for "
        f"<strong>{safe_reward_name}</strong>.</p>"
        f"<p><strong>Points used:</strong> {points_cost}</p>"
        "<p>Your reward will be processed, and our team will contact you using your "
        "registered email or phone.</p>"
        "<p>This is an automated no-reply email from M-Taka.</p>"
    )
    _send_email(subject, text_body, html_body, user.email)

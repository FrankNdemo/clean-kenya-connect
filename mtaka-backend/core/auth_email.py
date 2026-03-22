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


def email_delivery_is_configured() -> bool:
    if _uses_brevo_api():
        _, sender_email = _get_sender_identity()
        return bool(getattr(settings, "BREVO_API_KEY", "").strip() and sender_email)

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
    frontend_url = str(getattr(settings, "FRONTEND_URL", "") or "").strip()
    if _uses_brevo_api():
        sender_name, sender_email = _get_sender_identity()
        api_key = str(getattr(settings, "BREVO_API_KEY", "") or "").strip()
        return {
            "provider": "brevo",
            "configured": bool(api_key and sender_email),
            "sender_name": sender_name,
            "sender_email": sender_email,
            "frontend_url_configured": bool(frontend_url),
            "notes": [
                "Set DJANGO_BREVO_API_KEY in Render.",
                "Verify the sender email in Brevo before sending to other recipients.",
            ],
        }

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
    api_key = str(getattr(settings, "BREVO_API_KEY", "") or "").strip()
    if not api_key:
        raise RuntimeError("Brevo email API is not configured.")

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
    request = Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json",
        },
        method="POST",
    )

    timeout = int(getattr(settings, "EMAIL_TIMEOUT", 20) or 20)
    try:
        with urlopen(request, timeout=timeout) as response:
            response.read()
    except HTTPError as exc:
        try:
            error_body = exc.read().decode("utf-8", errors="replace").strip()
        except Exception:
            error_body = ""
        message = f"Brevo email API returned HTTP {exc.code}"
        if error_body:
            message = f"{message}: {error_body}"
        raise RuntimeError(message) from exc
    except URLError as exc:
        raise RuntimeError(f"Brevo email API request failed: {exc.reason}") from exc


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

from urllib.parse import urlencode, urlsplit

from django.conf import settings
from django.core.mail import EmailMultiAlternatives


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


def _send_email(subject: str, text_body: str, html_body: str, recipient: str) -> None:
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

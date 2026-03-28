import base64
import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


class MpesaIntegrationError(Exception):
    def __init__(self, message: str, status_code: int = 502, payload: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload = payload or {}


def mpesa_is_configured() -> bool:
    required = [
        getattr(settings, 'MPESA_CONSUMER_KEY', '').strip(),
        getattr(settings, 'MPESA_CONSUMER_SECRET', '').strip(),
        getattr(settings, 'MPESA_BUSINESS_SHORTCODE', '').strip(),
        getattr(settings, 'MPESA_PASSKEY', '').strip(),
    ]
    return all(required)


def normalize_mpesa_phone_number(value: str) -> str:
    raw = str(value or '').strip()
    digits = ''.join(char for char in raw if char.isdigit())
    if not digits:
        raise MpesaIntegrationError('A valid phone number is required.', status_code=400)

    if digits.startswith('0') and len(digits) == 10:
        digits = f'254{digits[1:]}'
    elif digits.startswith('7') and len(digits) == 9:
        digits = f'254{digits}'
    elif digits.startswith('254') and len(digits) == 12:
        digits = digits
    else:
        raise MpesaIntegrationError(
            'Use a valid Kenyan M-Pesa number like 07XXXXXXXX or 2547XXXXXXXX.',
            status_code=400,
        )

    return digits


def mask_phone_number(value: str) -> str:
    digits = ''.join(char for char in str(value or '') if char.isdigit())
    if len(digits) < 4:
        return digits
    return f'{digits[:3]}******{digits[-3:]}'


def normalize_mpesa_amount(value: Decimal | int | float | str) -> int:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise MpesaIntegrationError('A valid M-Pesa amount is required.', status_code=400) from exc

    if amount <= 0:
        raise MpesaIntegrationError('M-Pesa amount must be greater than zero.', status_code=400)

    return int(amount.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def _mpesa_base_url() -> str:
    env = getattr(settings, 'MPESA_ENV', 'sandbox').strip().lower()
    if env == 'production':
        return 'https://api.safaricom.co.ke'
    return 'https://sandbox.safaricom.co.ke'


def _nairobi_timestamp() -> str:
    return datetime.now(ZoneInfo('Africa/Nairobi')).strftime('%Y%m%d%H%M%S')


def _stk_password(timestamp: str) -> str:
    raw = f"{settings.MPESA_BUSINESS_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}"
    return base64.b64encode(raw.encode('utf-8')).decode('utf-8')


def _http_json(
    *,
    url: str,
    method: str,
    headers: dict[str, str] | None = None,
    payload: dict | None = None,
) -> dict:
    request_headers = {
        'Accept': 'application/json',
    }
    if headers:
        request_headers.update(headers)

    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        request_headers.setdefault('Content-Type', 'application/json')

    request = Request(url, data=data, headers=request_headers, method=method)
    timeout = int(getattr(settings, 'MPESA_TIMEOUT_SECONDS', 20))

    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode('utf-8').strip()
            return json.loads(body) if body else {}
    except HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace').strip()
        parsed = {}
        if body:
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                parsed = {'detail': body}
        logger.exception('M-Pesa HTTP error for %s %s', method, url)
        message = (
            parsed.get('errorMessage')
            or parsed.get('error')
            or parsed.get('detail')
            or 'M-Pesa request failed.'
        )
        raise MpesaIntegrationError(message, status_code=502, payload=parsed) from exc
    except URLError as exc:
        logger.exception('M-Pesa network error for %s %s', method, url)
        raise MpesaIntegrationError(
            'Unable to reach the M-Pesa service right now.',
            status_code=502,
        ) from exc


def get_mpesa_access_token() -> str:
    if not mpesa_is_configured():
        raise MpesaIntegrationError('M-Pesa is not configured on the server.', status_code=503)

    cache_key = 'mpesa:access-token'
    cached = cache.get(cache_key)
    if cached:
        return str(cached)

    credentials = f"{settings.MPESA_CONSUMER_KEY}:{settings.MPESA_CONSUMER_SECRET}"
    authorization = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
    response = _http_json(
        url=f'{_mpesa_base_url()}/oauth/v1/generate?grant_type=client_credentials',
        method='GET',
        headers={
            'Authorization': f'Basic {authorization}',
        },
    )
    token = str(response.get('access_token') or '').strip()
    if not token:
        raise MpesaIntegrationError('Failed to obtain an M-Pesa access token.', status_code=502, payload=response)

    cache.set(cache_key, token, timeout=3300)
    return token


def initiate_stk_push(
    *,
    phone_number: str,
    amount: Decimal | int | float | str,
    callback_url: str,
    account_reference: str,
    transaction_desc: str,
) -> dict:
    if not callback_url or not str(callback_url).lower().startswith(('http://', 'https://')):
        raise MpesaIntegrationError('A public callback URL is required for M-Pesa payments.', status_code=500)

    normalized_phone = normalize_mpesa_phone_number(phone_number)
    normalized_amount = normalize_mpesa_amount(amount)
    timestamp = _nairobi_timestamp()
    token = get_mpesa_access_token()

    payload = {
        'BusinessShortCode': settings.MPESA_BUSINESS_SHORTCODE,
        'Password': _stk_password(timestamp),
        'Timestamp': timestamp,
        'TransactionType': getattr(settings, 'MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
        'Amount': normalized_amount,
        'PartyA': normalized_phone,
        'PartyB': settings.MPESA_BUSINESS_SHORTCODE,
        'PhoneNumber': normalized_phone,
        'CallBackURL': callback_url,
        'AccountReference': str(account_reference or 'MTAKA')[:20],
        'TransactionDesc': str(transaction_desc or 'M-Taka payment')[:30],
    }

    response = _http_json(
        url=f'{_mpesa_base_url()}/mpesa/stkpush/v1/processrequest',
        method='POST',
        headers={
            'Authorization': f'Bearer {token}',
        },
        payload=payload,
    )
    response_code = str(response.get('ResponseCode') or '').strip()
    if response_code not in {'0', ''}:
        raise MpesaIntegrationError(
            str(response.get('ResponseDescription') or response.get('errorMessage') or 'M-Pesa STK push failed.'),
            status_code=502,
            payload=response,
        )

    return {
        'request_payload': payload,
        'response_payload': response,
        'normalized_phone': normalized_phone,
        'normalized_amount': normalized_amount,
    }

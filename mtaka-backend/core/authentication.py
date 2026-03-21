from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.conf import settings

class CookieJWTAuthentication(JWTAuthentication):
    """Extend JWTAuthentication to read the access token from a cookie named 'access_token'.
    Falls back to the Authorization header if cookie is not present.
    """
    def authenticate(self, request):
        header = self.get_header(request)
        raw_token = None
        if header is not None:
            raw_token = self.get_raw_token(header)
        else:
            raw_token = request.COOKIES.get('access_token')

        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
        except TokenError:
            return None

        # Reject tokens created by older server instances.
        current_session_id = getattr(settings, 'RUNTIME_SESSION_ID', None)
        token_session_id = validated_token.get('sid')
        if current_session_id and token_session_id != current_session_id:
            return None

        return self.get_user(validated_token), validated_token

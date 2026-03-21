from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import decorator_from_middleware

class CsrfExemptMiddleware:
    """Exempt unauthenticated auth endpoints from CSRF checks."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path in ['/api/auth/register/', '/api/auth/login/']:
            request.csrf_processing_done = True
        return self.get_response(request)

class LogRequestMiddleware:
    """Log request headers for specific endpoints to help debug CSRF issues."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            path = request.path
            if path.startswith('/api/auth/register/') or path.startswith('/api/auth/login/'):
                print('--- Incoming request debug ---')
                print('PATH:', path)
                print('METHOD:', request.method)
                print('COOKIES:', request.COOKIES)
                meta = request.META
                print('HTTP_COOKIE:', meta.get('HTTP_COOKIE'))
                print('HTTP_X_CSRFTOKEN:', meta.get('HTTP_X_CSRFTOKEN'))
                print('HTTP_X_CSRF_TOKEN:', meta.get('HTTP_X_CSRF_TOKEN'))
                print('CONTENT_TYPE:', meta.get('CONTENT_TYPE'))
                print('--- end debug ---')
        except Exception as e:
            print('LogRequestMiddleware error:', e)

        return self.get_response(request)

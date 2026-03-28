from pathlib import Path
from datetime import timedelta
from importlib.util import find_spec
import hashlib
import os
from urllib.parse import urlparse, parse_qs

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

BASE_DIR = Path(__file__).resolve().parent.parent

# Lightweight .env loader (avoids extra dependency).
env_file = BASE_DIR / '.env'
if env_file.exists():
    for raw_line in env_file.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)

def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-vc3x4(p@&nd47a4g!6$@5o%!qcjbm@&cw+$f8@e_)c$#vc4+bk')
DEBUG = env_bool('DJANGO_DEBUG', True)
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv('DJANGO_ALLOWED_HOSTS', '192.168.0.101,localhost,127.0.0.1').split(',')
    if host.strip()
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django.contrib.humanize',
    'core',  
]

AUTH_USER_MODEL = 'core.User'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.gzip.GZipMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'core.middleware.CsrfExemptMiddleware',  
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

if find_spec('whitenoise') is not None:
    MIDDLEWARE.insert(
        MIDDLEWARE.index('django.middleware.gzip.GZipMiddleware'),
        'whitenoise.middleware.WhiteNoiseMiddleware',
    )

if env_bool('DJANGO_LOG_AUTH_DEBUG', False):
    MIDDLEWARE.insert(MIDDLEWARE.index('django.middleware.csrf.CsrfViewMiddleware'), 'core.middleware.LogRequestMiddleware')

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'dist'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'core.authentication.CookieJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

CACHE_BACKEND = os.getenv('DJANGO_CACHE_BACKEND', 'locmem').strip().lower()
if CACHE_BACKEND == 'redis':
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/1'),
            'TIMEOUT': int(os.getenv('DJANGO_CACHE_DEFAULT_TIMEOUT', '60')),
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'mtaka-default-cache',
            'TIMEOUT': int(os.getenv('DJANGO_CACHE_DEFAULT_TIMEOUT', '60')),
        }
    }

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Keep auth token verification stable across reloads and workers unless explicitly overridden.
RUNTIME_SESSION_ID = os.getenv('MTAKA_RUNTIME_SESSION_ID', '').strip() or hashlib.sha256(
    f'{SECRET_KEY}:mtaka-runtime-session'.encode('utf-8')
).hexdigest()

CORS_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
]
cors_allowed_origins_env = [
    origin.strip()
    for origin in os.getenv('DJANGO_CORS_ALLOWED_ORIGINS', '').split(',')
    if origin.strip()
]
if cors_allowed_origins_env:
    CORS_ALLOWED_ORIGINS = cors_allowed_origins_env
cors_allowed_origin_regexes_env = [
    pattern.strip()
    for pattern in os.getenv('DJANGO_CORS_ALLOWED_ORIGIN_REGEXES', '').split(',')
    if pattern.strip()
]
if cors_allowed_origin_regexes_env:
    CORS_ALLOWED_ORIGIN_REGEXES = cors_allowed_origin_regexes_env

CORS_ALLOW_CREDENTIALS = True
from corsheaders.defaults import default_headers

CORS_ALLOW_HEADERS = list(default_headers) + [
    'x-csrftoken',
    'x-csrf-token',
]

csrf_trusted = [
    origin.strip()
    for origin in os.getenv('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',')
    if origin.strip()
]
if csrf_trusted:
    CSRF_TRUSTED_ORIGINS = csrf_trusted

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

JWT_COOKIE_SECURE = env_bool('DJANGO_JWT_COOKIE_SECURE', not DEBUG)
JWT_COOKIE_SAMESITE = os.getenv('DJANGO_JWT_COOKIE_SAMESITE', 'Lax')
JWT_COOKIE_DOMAIN = os.getenv('DJANGO_JWT_COOKIE_DOMAIN', '').strip() or None
JWT_COOKIE_PERSISTENT = env_bool('DJANGO_JWT_COOKIE_PERSISTENT', False)

CSRF_COOKIE_SECURE = env_bool('DJANGO_CSRF_COOKIE_SECURE', not DEBUG)
SESSION_COOKIE_SECURE = env_bool('DJANGO_SESSION_COOKIE_SECURE', not DEBUG)

EMAIL_BACKEND = os.getenv(
    'DJANGO_EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend',
)
EMAIL_HOST = os.getenv('DJANGO_EMAIL_HOST', '').strip()
EMAIL_PORT = int(os.getenv('DJANGO_EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.getenv('DJANGO_EMAIL_HOST_USER', '').strip()
EMAIL_HOST_PASSWORD = os.getenv('DJANGO_EMAIL_HOST_PASSWORD', '').strip()
EMAIL_USE_TLS = env_bool('DJANGO_EMAIL_USE_TLS', True)
EMAIL_USE_SSL = env_bool('DJANGO_EMAIL_USE_SSL', False)
EMAIL_TIMEOUT = int(os.getenv('DJANGO_EMAIL_TIMEOUT', '20'))
DEFAULT_FROM_EMAIL = os.getenv('DJANGO_DEFAULT_FROM_EMAIL', 'M-Taka No-Reply <no-reply@mtaka.local>').strip()
SERVER_EMAIL = DEFAULT_FROM_EMAIL
BREVO_API_KEY = os.getenv('DJANGO_BREVO_API_KEY', '').strip()
FRONTEND_URL = os.getenv('MTAKA_FRONTEND_URL', '').strip()
API_PUBLIC_URL = os.getenv('MTAKA_API_PUBLIC_URL', '').strip()
PASSWORD_RESET_TIMEOUT = int(os.getenv('DJANGO_PASSWORD_RESET_TIMEOUT', '3600'))

MPESA_ENV = os.getenv('MPESA_ENV', 'sandbox').strip().lower()
MPESA_CONSUMER_KEY = os.getenv('MPESA_CONSUMER_KEY', '').strip()
MPESA_CONSUMER_SECRET = os.getenv('MPESA_CONSUMER_SECRET', '').strip()
MPESA_BUSINESS_SHORTCODE = os.getenv('MPESA_BUSINESS_SHORTCODE', '').strip() or os.getenv('MPESA_SHORTCODE', '').strip()
MPESA_PASSKEY = os.getenv('MPESA_PASSKEY', '').strip()
MPESA_CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL', '').strip()
MPESA_TRANSACTION_TYPE = os.getenv('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline').strip()
MPESA_TIMEOUT_SECONDS = int(os.getenv('MPESA_TIMEOUT_SECONDS', '20'))

database_url = os.getenv('DATABASE_URL', '').strip()
db_engine = os.getenv('DB_ENGINE', 'sqlite').strip().lower()
db_conn_max_age = int(os.getenv('DB_CONN_MAX_AGE', '60'))
supabase_db_host = os.getenv('SUPABASE_DB_HOST', '').strip()
supabase_db_password = os.getenv('SUPABASE_DB_PASSWORD', '').strip()
password_is_placeholder = supabase_db_password.upper().startswith('REPLACE_')
use_supabase_fields = bool(supabase_db_host and supabase_db_password and not password_is_placeholder)

if database_url:
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query)
    is_postgres = 'postgres' in parsed.scheme
    engine = 'django.db.backends.postgresql' if is_postgres else 'django.db.backends.mysql'
    options = {}
    if is_postgres:
        options['sslmode'] = os.getenv('DB_SSLMODE', query.get('sslmode', ['require'])[0])

    DATABASES = {
        'default': {
            'ENGINE': engine,
            'NAME': parsed.path.lstrip('/'),
            'USER': parsed.username or '',
            'PASSWORD': parsed.password or '',
            'HOST': parsed.hostname or '',
            'PORT': str(parsed.port or ('5432' if is_postgres else '3306')),
            'CONN_MAX_AGE': db_conn_max_age,
            'OPTIONS': options,
        }
    }
elif db_engine in ('postgres', 'postgresql') and use_supabase_fields:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('SUPABASE_DB_NAME', 'postgres'),
            'USER': os.getenv('SUPABASE_DB_USER', 'postgres'),
            'PASSWORD': os.getenv('SUPABASE_DB_PASSWORD', ''),
            'HOST': os.getenv('SUPABASE_DB_HOST', ''),
            'PORT': os.getenv('SUPABASE_DB_PORT', '5432'),
            'CONN_MAX_AGE': db_conn_max_age,
            'OPTIONS': {
                'sslmode': os.getenv('DB_SSLMODE', 'require'),
            },
        }
    }
elif db_engine in ('mysql', 'mariadb'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': os.getenv('MYSQL_DB_NAME', 'mtaka_db'),
            'USER': os.getenv('MYSQL_DB_USER', 'root'),
            'PASSWORD': os.getenv('MYSQL_DB_PASSWORD', ''),
            'HOST': os.getenv('MYSQL_DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('MYSQL_DB_PORT', '3306'),
            'CONN_MAX_AGE': db_conn_max_age,
        }
    }
else:
    sqlite_db_path = os.getenv('SQLITE_DB_PATH', '').strip()
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': sqlite_db_path or (BASE_DIR / 'db.sqlite3'),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Optional local-dev speedup. Keep disabled in production.
if env_bool('DJANGO_FAST_DEV_AUTH', False):
    PASSWORD_HASHERS = [
        'django.contrib.auth.hashers.MD5PasswordHasher',
        'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    ]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/assets/'  
STATICFILES_DIRS = [
    BASE_DIR / 'dist' / 'assets',  
]
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR


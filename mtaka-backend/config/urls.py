from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.views.static import serve
from django.conf import settings
from core import views as core_views


def media_serve(request, path):
    return serve(request, path, document_root=settings.MEDIA_ROOT)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', core_views.health_check, name='health_check'),

    path('api/auth/', include('core.urls')),
    re_path(
        r'^(?P<path>(favicon\.ico|robots\.txt|sw\.js|manifest\.webmanifest|pwa-192x192\.png|pwa-512x512\.png))$',
        serve,
        {'document_root': settings.BASE_DIR / 'dist'},
    ),
    re_path(
        r'^\.well-known/(?P<path>assetlinks\.json)$',
        serve,
        {'document_root': settings.BASE_DIR / 'dist' / '.well-known'},
    ),
    re_path(
        r'^media/(?P<path>(dumping_reports|event_covers)/.*)$',
        media_serve,
    ),

    re_path(r'^.*$', TemplateView.as_view(template_name='index.html')),
]

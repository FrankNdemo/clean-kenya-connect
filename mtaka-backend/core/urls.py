from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'waste-types', views.WasteTypeViewSet)
router.register(r'collections', views.CollectionRequestViewSet, basename='collection')
router.register(r'collection-updates', views.CollectionRequestUpdateViewSet, basename='collection-update')
router.register(r'events', views.EventViewSet)
router.register(r'recyclers', views.RecyclerViewSet)
router.register(r'recyclable-listings', views.RecyclableListingViewSet, basename='recyclable-listing')
router.register(r'price-offers', views.PriceOfferViewSet, basename='price-offer')
router.register(r'recycler-transactions', views.RecyclerTransactionViewSet, basename='recycler-transaction')
router.register(r'collector-transactions', views.CollectorTransactionViewSet, basename='collector-transaction')
router.register(r'dumping-reports', views.IllegalDumpingViewSet, basename='dumping')
router.register(r'green-credits', views.GreenCreditViewSet, basename='credits')
router.register(r'complaints', views.ComplaintViewSet, basename='complaints')
router.register(r'suspended-users', views.SuspendedUserViewSet, basename='suspended')

urlpatterns = [
    # Authentication
    path('register/', views.register_user, name='register'),
    path('login/', views.login_user, name='login'),
    path('email-status/', views.email_delivery_status, name='email_status'),
    path('password-reset/request/', views.password_reset_request, name='password_reset_request'),
    path('password-reset/validate/', views.password_reset_validate, name='password_reset_validate'),
    path('password-reset/confirm/', views.password_reset_confirm, name='password_reset_confirm'),
    path('profile/', views.get_user_profile, name='profile'),
    path('location/resolve/', views.resolve_location_county, name='location_resolve'),
    path('token/refresh/', views.refresh_token_cookie, name='token_refresh'),
    path('logout/', views.logout_user, name='logout'),
    path('csrf/', views.get_csrf_token, name='get_csrf'),
    path('users/', views.list_users, name='users'),
    path('users/<int:user_id>/', views.manage_user, name='manage_user'),
    
    # Router URLs
    path('', include(router.urls)),
]

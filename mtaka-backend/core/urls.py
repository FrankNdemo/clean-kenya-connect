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
    path('profile/', views.get_user_profile, name='profile'),
    path('token/refresh/', views.refresh_token_cookie, name='token_refresh'),
    path('logout/', views.logout_user, name='logout'),
    path('csrf/', views.get_csrf_token, name='get_csrf'),
    path('users/', views.list_users, name='users'),
    
    # Router URLs
    path('', include(router.urls)),
]

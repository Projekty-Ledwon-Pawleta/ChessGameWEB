from django.urls import path
from . import views
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import RoomListAPIView, RoomCreateAPIView, RoomJoinAPIView


urlpatterns = [
    path('', views.home, name='home'),
    path('auth/jwt/create/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/jwt/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('rooms/', RoomListAPIView.as_view(), name='rooms-list'),
    path('rooms/create/', RoomCreateAPIView.as_view(), name='rooms-create'),
    path('rooms/<str:name>/join/', RoomJoinAPIView.as_view(), name='rooms-join'),
]

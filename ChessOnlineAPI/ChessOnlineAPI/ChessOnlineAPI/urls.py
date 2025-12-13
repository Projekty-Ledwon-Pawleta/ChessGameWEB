from django.contrib import admin
from django.urls import path, include, re_path

from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

schema_view = get_schema_view(
    openapi.Info(
        title="ChessOnline API",
        default_version="v1",
        description="API documentation for ChessOnline application"
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # <-- tutaj dodajemy oba: dj-rest-auth (login/logout/password) oraz registration
    path('auth/', include('dj_rest_auth.urls')),                      # daje: /auth/login/, /auth/logout/, /auth/user/, ...
    path('auth/registration/', include('dj_rest_auth.registration.urls')),  # daje rejestrację

    # jeśli używasz JWT z SimpleJWT, możesz też dodać standardowe endpoints:
    # from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
    # path('auth/jwt/create/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    # path('auth/jwt/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # swagger / redoc
    re_path(r'^swagger(?P<format>\.json|\.yaml)$', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),

    path('', include('myapp.urls')),
]

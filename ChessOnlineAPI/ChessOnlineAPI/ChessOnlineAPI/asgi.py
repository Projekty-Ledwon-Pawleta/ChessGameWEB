"""
ASGI config for ChessOnlineAPI project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

from myapp.middleware import JwtAuthMiddleware

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ChessOnlineAPI.settings")


import os
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

django.setup()

from myapp import routing

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,  # regular HTTP
    "websocket": JwtAuthMiddleware(
        URLRouter(routing.websocket_urlpatterns)
    ),
})
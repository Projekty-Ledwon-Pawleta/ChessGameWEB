from django.urls import re_path

from .consumers import ChessGameConsumer

websocket_urlpatterns = [
    # ws://<host>/ws/game/<room_name>/
    re_path(r'^ws/game/(?P<room_name>[^/]+)/$', ChessGameConsumer.as_asgi()),
]
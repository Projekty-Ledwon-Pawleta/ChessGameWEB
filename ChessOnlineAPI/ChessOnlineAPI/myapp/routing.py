from django.urls import re_path

from .consumers import ChessGameConsumer, LobbyConsumer

websocket_urlpatterns = [
    re_path(r'^ws/game/(?P<room_name>[^/]+)/$', ChessGameConsumer.as_asgi()),
    re_path(r'ws/lobby/$', LobbyConsumer.as_asgi()),
]
# games/middleware.py
from urllib.parse import parse_qs
from django.contrib.auth.models import AnonymousUser
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
import jwt
from django.conf import settings

User = get_user_model()
SECRET_KEY = settings.SECRET_KEY

@database_sync_to_async
def get_user(user_id):
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()

class JwtAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        qs = parse_qs(query_string)
        token = qs.get("token", [None])[0]

        if token:
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
                user = await get_user(payload.get("user_id"))
            except Exception:
                user = AnonymousUser()
        else:
            user = AnonymousUser()

        scope["user"] = user

        # 🔥 KLUCZOWA LINIA
        return await self.inner(scope, receive, send)


# games/consumers.py
import json
import asyncio
import functools
import logging
import traceback
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Game
from .engine_adapter import EngineWrapper

# Logging setup
logger = logging.getLogger("chess")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    fh = logging.FileHandler("chess_debug.log", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    sh = logging.StreamHandler()
    sh.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    fh.setFormatter(fmt)
    sh.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(sh)

class ChessGameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']

        if not self.room_name or len(self.room_name) > 64:
            await self.close()
            return

        self.group_name = f"game_{self.room_name}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        user = self.scope.get("user")
        logger.info(
            "Client connected: room=%s channel=%s user=%s",
            self.room_name, self.channel_name, user
        )

        try:
            await self._ensure_game_exists()
            state = await self._get_state()

            await self.send_json({
                "type": "connected",
                "room": self.room_name,
                "state": state
            })

            # 🔔 notify others
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "player_joined",
                    "user": str(user) if user else "anon"
                }
            )
        except Exception:
            logger.exception("Error during connect")
            await self.send_json({"type": "error", "detail": "server error during connect"})

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("Client disconnected: room=%s channel=%s", self.room_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data)
        except Exception:
            logger.warning("Invalid JSON received: %s", text_data)
            await self.send_json({"type":"error", "detail":"invalid json"})
            return
        
        user = self.scope.get("user") 
        msg_type = data.get("type")

        if msg_type in ("move", "chat") and (not user or user.is_anonymous): 
            await self.send_json({"type": "error", "detail": "authentication required"}) 
            return

        if msg_type == "move":
            move_data = data.get("move")
            if not move_data or not isinstance(move_data, dict):
                await self.send_json({"type":"error","detail":"no move data or invalid format"})
                return

            logger.info("Move requested: %s by user=%s in room=%s", move_data, self.scope.get("user"), self.room_name)

            loop = asyncio.get_running_loop()
            func = functools.partial(self._apply_move_sync, move_data)
            result = await loop.run_in_executor(None, func)

            success, payload_or_err = result
            if success:
                logger.info("Move applied successfully: %s", move_data)
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "broadcast_move", "move": payload_or_err}
                )
            else:
                logger.info("Move rejected: %s reason=%s", move_data, payload_or_err)
                await self.send_json({"type":"error","detail": payload_or_err})
        elif msg_type == "sync_request":
            state = await self._get_state()
            await self.send_json({"type":"sync", "state": state})
        elif msg_type == "chat":
            msg = data.get("message", "")
            logger.info("Chat in room %s: %s", self.room_name, msg)
            await self.channel_layer.group_send(self.group_name, {"type":"broadcast_chat", "message": msg, "sender": str(self.scope.get("user") or "anon")})
        else:
            logger.warning("Unknown message type: %s", msg_type)
            await self.send_json({"type":"error","detail":"unknown message type"})

    async def broadcast_move(self, event):
        await self.send_json({"type":"move", "move": event["move"]})

    async def broadcast_chat(self, event):
        await self.send_json({"type":"chat", "message": event["message"], "sender": event.get("sender")})
    
    async def player_joined(self, event): await self.send_json({ "type": "player_joined", "user": event["user"] })

    def _apply_move_sync(self, move_data: dict):
        try:
            logger.debug("_apply_move_sync start for move=%s room=%s", move_data, self.room_name)
            game, created = Game.objects.get_or_create(room_name=self.room_name)
            if created or not game.state:
                game.state = EngineWrapper.get_initial_state()

            # --- pass JSON directly do validate_and_apply ---
            valid, new_state, info = EngineWrapper.validate_and_apply(game.state, move_data)
            if not valid:
                err = info.get("error") if isinstance(info, dict) else str(info)
                logger.debug("Engine rejected move=%s error=%s", move_data, err)
                return False, err or "illegal move"

            game.state = new_state
            game.save(update_fields=["state", "updated_at"])

            payload = {
                "uci": info.get("uci", move_data),
                "info": info,
                "state": json.loads(new_state),
            }
            
            logger.debug("_apply_move_sync success payload=%s", payload)
            return True, payload
        except Exception as e:
            tb = traceback.format_exc()
            logger.exception("Exception in _apply_move_sync: %s", tb)
            with open("chess_error_traceback.log", "a", encoding="utf-8") as f:
                f.write(tb + "\n\n")
            return False, f"server error: {e}"

    @database_sync_to_async
    def _ensure_game_exists(self):
        game, created = Game.objects.get_or_create(room_name=self.room_name)
        if created or not game.state:
            game.state = EngineWrapper.get_initial_state()
            game.save(update_fields=["state"])

    @database_sync_to_async
    def _get_state(self):
        game = Game.objects.get(room_name=self.room_name)
        try:
            obj = json.loads(game.state) if game.state else {}
        except Exception:
            logger.warning("Failed to parse game.state for room=%s", self.room_name)
            obj = {}

        # Spróbuj wywnioskować aktualną turę przez rekonstrukcję managera
        try:
            mgr, _ = EngineWrapper._reconstruct_manager_from_state(game.state)
            # korzystamy z metody get_game_turn() którą dodałeś
            turn = mgr.get_game_turn()
        except Exception:
            logger.exception("Failed to reconstruct manager to determine turn for room=%s", self.room_name)
            turn = None

        return {"state": obj, "turn": turn}

    async def send_json(self, data):
        await self.send(text_data=json.dumps(data))

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from .models import Room
from django.contrib.auth import get_user_model

User = get_user_model()

# helpery db-bound
@database_sync_to_async
def get_all_rooms_serialized():
    qs = Room.objects.order_by('-created_at')[:200]
    return [
        {
            'name': r.name,
            'players': [u.username if hasattr(u, 'username') else str(u.id) for u in r.players.all()],
            'players_count': r.players_count,
            'has_password': bool(r.password_hash),
            'status': r.status,
        } for r in qs
    ]

@database_sync_to_async
def create_room_db(name, host_id, password):
    host = User.objects.get(id=host_id)
    room = Room.objects.create(name=name, host=host)
    room.set_password(password)
    room.save()
    room.players.add(host)
    return {
        'name': room.name,
        'players': [host.username or str(host.id)],
        'players_count': room.players_count,
        'has_password': bool(room.password_hash),
        'status': room.status,
    }

@database_sync_to_async
def try_join_room_db(name, user_id, password):
    try:
        room = Room.objects.get(name=name)
    except Room.DoesNotExist:
        return {'success': False, 'error': 'no_room'}
    if room.status != Room.STATUS_OPEN:
        return {'success': False, 'error': 'not_open'}
    if not room.check_password(password):
        return {'success': False, 'error': 'bad_password'}
    user = User.objects.get(id=user_id)
    room.players.add(user)
    return {'success': True, 'room': {
        'name': room.name,
        'players': [p.username or str(p.id) for p in room.players.all()],
        'players_count': room.players_count,
        'has_password': bool(room.password_hash),
        'status': room.status,
    }}


class LobbyConsumer(AsyncJsonWebsocketConsumer):
    """
    Protocol: clients join group 'lobby'
    supported incoming:
      {type: 'lobby_subscribe'}
      {type: 'create_room', name, password, max_players}
      {type: 'join_room', name, password}
    outgoing events:
      room_list, room_created, room_update, joined, error
    """
    async def connect(self):
        # allow anonymous to view lobby but we keep user on scope (middleware)
        await self.accept()
        await self.channel_layer.group_add("lobby", self.channel_name)
        # optionally send initial list
        rooms = await get_all_rooms_serialized()
        await self.send_json({'type': 'room_list', 'rooms': rooms})

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("lobby", self.channel_name)

    async def receive_json(self, content):
        typ = content.get('type')
        user = self.scope.get('user') or AnonymousUser()
        if typ == 'lobby_subscribe':
            rooms = await get_all_rooms_serialized()
            await self.send_json({'type': 'room_list', 'rooms': rooms})
            return

        if typ == 'create_room':
            if user.is_anonymous:
                await self.send_json({'type': 'error', 'message': 'auth required'})
                return
            name = content.get('name')
            password = content.get('password', '')
            room_obj = await create_room_db(name, user.id, password)
            # broadcast new room to lobby
            await self.channel_layer.group_send("lobby", {
                "type": "lobby.room_created",
                "room": room_obj
            })
            # also notify creator
            await self.send_json({'type': 'room_created', 'room': room_obj})
            return

        if typ == 'join_room':
            if user.is_anonymous:
                await self.send_json({'type': 'error', 'message': 'auth required'})
                return
            name = content.get('name')
            password = content.get('password', '')
            res = await try_join_room_db(name, user.id, password)
            if not res.get('success'):
                err = res.get('error', 'unknown')
                await self.send_json({'type': 'error', 'message': err})
                return
            # broadcast room_update to lobby
            await self.channel_layer.group_send("lobby", {
                "type": "lobby.room_update",
                "room": res['room']
            })
            # notify the joiner
            await self.send_json({'type': 'joined', 'room': res['room'], 'success': True})
            return

        # unknown type
        await self.send_json({'type': 'error', 'message': 'unknown type'})

    # handlers for group sends
    async def lobby_room_created(self, event):
        await self.send_json({'type': 'room_created', 'room': event['room']})

    async def lobby_room_update(self, event):
        await self.send_json({'type': 'room_update', 'room': event['room']})

# games/consumers.py
import json
import asyncio
import functools
import logging
import traceback
from channels.generic.websocket import AsyncWebsocketConsumer, AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from .models import Game, Room
from .engine_adapter import EngineWrapper

User = get_user_model()

# Logging setup (bez zmian)
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

# --- DB HELPERS ---

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
    Game.objects.filter(room_name=name).delete()
    
    host = User.objects.get(id=host_id)
    room = Room.objects.create(name=name, host=host)
    if password:
        room.set_password(password)
    room.save()
    room.players.add(host)
    
    # Tworzymy od razu świeży obiekt Game, żeby był gotowy
    Game.objects.create(room_name=name, state=EngineWrapper.get_initial_state())

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
    
    # Sprawdzamy czy gracz już tam nie jest (reconnect)
    if room.players.filter(id=user_id).exists():
         return {'success': True, 'room': _serialize_room(room)}

    if room.status != Room.STATUS_OPEN:
        return {'success': False, 'error': 'not_open'}
    
    # Walidacja hasła tylko jeśli pokój ma hasło
    if room.password_hash and not room.check_password(password):
        return {'success': False, 'error': 'bad_password'}
        
    if room.players.count() >= 2:
        return {'success': False, 'error': 'room_full'}

    user = User.objects.get(id=user_id)
    room.players.add(user)
    
    # Aktualizacja statusu jeśli pełny
    if room.players.count() >= 2:
        # Opcjonalnie: zmiana statusu na PLAYING
        pass 

    return {'success': True, 'room': _serialize_room(room)}

@database_sync_to_async
def remove_player_from_room_db(room_name, user_id):
    """
    Usuwa gracza z pokoju. Jeśli pokój pusty -> usuwa Room ORAZ Game.
    """
    try:
        room = Room.objects.get(name=room_name)
        user = User.objects.get(id=user_id)
        room.players.remove(user)
        
        # Jeśli pokój jest pusty, usuwamy go
        if room.players.count() == 0:
            # --- POPRAWKA 2: CZYSZCZENIE STANU ---
            # Usuwamy stan gry powiązany z tym pokojem, aby następna gra o tej nazwie była czysta
            Game.objects.filter(room_name=room_name).delete()
            
            room.delete()
            return None
            
        return _serialize_room(room)
    except (Room.DoesNotExist, User.DoesNotExist):
        return None

def _serialize_room(room):
    return {
        'name': room.name,
        'players': [p.username or str(p.id) for p in room.players.all()],
        'players_count': room.players_count,
        'has_password': bool(room.password_hash),
        'status': room.status,
    }


# --- CONSUMERS ---

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
        logger.info("Client connected: room=%s channel=%s user=%s", self.room_name, self.channel_name, user)

        try:
            # Upewnij się, że gra istnieje (logika szachowa)
            await self._ensure_game_exists()
            state = await self._get_state()

            players_list = await self._get_game_players()

            await self.send_json({
                "type": "connected",
                "room": self.room_name,
                "state": state,
                "players": players_list # <--- Wysyłamy to do Reacta
            })

            # Powiadom innych w pokoju gry
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "player_joined",
                    "user": str(user) if user and not user.is_anonymous else "anon"
                }
            )
        except Exception:
            logger.exception("Error during connect")
            await self.send_json({"type": "error", "detail": "server error during connect"})

    async def disconnect(self, close_code):
        # 1. Usuń z grupy WebSocket
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("Client disconnected: room=%s", self.room_name)

        # 2. Usuń gracza z bazy danych (Room) i zaktualizuj Lobby
        user = self.scope.get("user")
        if user and not user.is_anonymous:
            updated_room_data = await remove_player_from_room_db(self.room_name, user.id)
            
            if updated_room_data:
                # Jeśli pokój nadal istnieje, wyślij update do Lobby
                await self.channel_layer.group_send("lobby", {
                    "type": "lobby.room_update",
                    "room": updated_room_data
                })
            else:
                # Jeśli pokój został usunięty (bo był pusty), wyślij informację o usunięciu?
                # Można to obsłużyć, ale room_update zazwyczaj wystarczy, 
                # chyba że chcemy jawnie usunąć kafelek z frontu.
                # W prostym wariancie, jeśli update nie przyjdzie, lista się nie odświeży, 
                # więc lepiej wysłać "room_list" ponownie lub specjalny event "room_deleted".
                # Tutaj dla uproszczenia po prostu zmusimy lobby do odświeżenia listy.
                rooms = await get_all_rooms_serialized()
                await self.channel_layer.group_send("lobby", {
                    "type": "lobby.room_list_update", # Nowy typ wiadomości pomocniczy
                    "rooms": rooms
                })

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
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "broadcast_move", "move": payload_or_err}
                )
            else:
                await self.send_json({"type":"error","detail": payload_or_err})
        
        elif msg_type == "sync_request":
            state = await self._get_state()
            await self.send_json({"type":"sync", "state": state})
        
        elif msg_type == "chat":
            msg = data.get("message", "")
            await self.channel_layer.group_send(self.group_name, {"type":"broadcast_chat", "message": msg, "sender": str(user)})
        
        else:
            logger.warning("Unknown message type: %s", msg_type)
            await self.send_json({"type":"error","detail":"unknown message type"})

    # Event Handlers
    async def broadcast_move(self, event):
        await self.send_json({"type":"move", "move": event["move"]})

    async def broadcast_chat(self, event):
        await self.send_json({"type":"chat", "message": event["message"], "sender": event.get("sender")})
    
    async def player_joined(self, event): 
        await self.send_json({ "type": "player_joined", "user": event["user"] })

    # Helpery Sync/Async (bez zmian logiki gry)
    def _apply_move_sync(self, move_data: dict):
        # ... (tutaj Twoja logika silnika szachowego z poprzedniego kodu)
        try:
            game, created = Game.objects.get_or_create(room_name=self.room_name)
            if created or not game.state:
                game.state = EngineWrapper.get_initial_state()

            valid, new_state, info = EngineWrapper.validate_and_apply(game.state, move_data)
            if not valid:
                err = info.get("error") if isinstance(info, dict) else str(info)
                return False, err or "illegal move"

            game.state = new_state
            game.save(update_fields=["state", "updated_at"])

            payload = {
                "uci": info.get("uci", move_data),
                "info": info,
                "state": json.loads(new_state),
            }
            return True, payload
        except Exception as e:
            tb = traceback.format_exc()
            logger.exception("Exception in _apply_move_sync")
            return False, f"server error: {e}"

    @database_sync_to_async
    def _ensure_game_exists(self):
        game, created = Game.objects.get_or_create(room_name=self.room_name)
        if created or not game.state:
            game.state = EngineWrapper.get_initial_state()
            game.save(update_fields=["state"])

    @database_sync_to_async
    def _get_game_players(self):
        try:
            # Zakładamy, że pierwszy gracz (zazwyczaj host) to białe, drugi to czarne.
            # Sortujemy po ID, żeby kolejność była zawsze ta sama.
            room = Room.objects.get(name=self.room_name)
            return [p.username for p in room.players.all().order_by('id')]
        except Room.DoesNotExist:
            return []

    @database_sync_to_async
    def _get_state(self):
        # ... (Twoja logika pobierania stanu)
        game = Game.objects.get(room_name=self.room_name)
        try:
            obj = json.loads(game.state) if game.state else {}
        except:
            obj = {}
        
        try:
            mgr, _ = EngineWrapper._reconstruct_manager_from_state(game.state)
            turn = mgr.get_game_turn()
        except:
            turn = None
        return {"state": obj, "turn": turn}

    async def send_json(self, data):
        await self.send(text_data=json.dumps(data))


# --- LOBBY CONSUMER ---

class LobbyConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        await self.accept()
        await self.channel_layer.group_add("lobby", self.channel_name)
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
            
            # Tworzymy pokój w DB
            room_obj = await create_room_db(name, user.id, password)
            
            # 1. Broadcast do wszystkich w lobby (że powstał nowy pokój)
            await self.channel_layer.group_send("lobby", {
                "type": "lobby.room_created",
                "room": room_obj
            })
            
            # 2. AUTO-JOIN: Wyślij wiadomość 'joined' bezpośrednio do twórcy!
            # To sprawi, że frontend od razu przekieruje go do gry.
            await self.send_json({
                'type': 'joined', 
                'room': room_obj, 
                'success': True
            })
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
            
            # Broadcast update do lobby (zmieniła się liczba graczy)
            await self.channel_layer.group_send("lobby", {
                "type": "lobby.room_update",
                "room": res['room']
            })
            
            # Notify the joiner
            await self.send_json({'type': 'joined', 'room': res['room'], 'success': True})
            return

        await self.send_json({'type': 'error', 'message': 'unknown type'})

    # Handlers for group sends
    async def lobby_room_created(self, event):
        await self.send_json({'type': 'room_created', 'room': event['room']})

    async def lobby_room_update(self, event):
        await self.send_json({'type': 'room_update', 'room': event['room']})
    
    # Dodatkowa obsługa pełnego odświeżenia listy (np. po usunięciu pokoju)
    async def lobby_room_list_update(self, event):
        await self.send_json({'type': 'room_list', 'rooms': event['rooms']})
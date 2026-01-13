# games/consumers.py
import json
import asyncio
import functools
import logging
import time
import traceback
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer, AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from .models import Game, GameHistory, Room
from .engine_adapter import EngineWrapper
from django.db.models import Count
from myapp.models import PlayerProfile
from myapp.elo_service import update_ratings

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
def find_open_room_for_quick_match(user_id):
    possible_rooms = Room.objects.annotate(p_count=Count('players')).filter(
        status=Room.STATUS_OPEN,
        password_hash='',
        p_count=1
    ).exclude(players__id=user_id)

    if possible_rooms.exists():
        return possible_rooms.first()
    return None

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
    Game.objects.create(
        room_name=name, 
        state=EngineWrapper.get_initial_state(),
        white_player=host)

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
    
    try:
        game = Game.objects.get(room_name=name)
        # Jeśli nie ma czarnego gracza i dołączający to nie jest ten sam co biały
        if not game.black_player and game.white_player != user:
            game.black_player = user
            game.save(update_fields=['black_player'])
    except Game.DoesNotExist:
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

def process_game_result_sync(room_name, winner_color, reason):
    """
    Synchroniczna wersja aktualizacji ELO, używana wewnątrz _apply_move_sync
    winner_color: 'b', 'c', lub None
    """
    try:
        game = Game.objects.get(room_name=room_name)
        white_player = game.white_player
        black_player = game.black_player

        if not white_player or not black_player:
            return

        # Używamy related_name='profile' zdefiniowanego w modelu
        p_white = white_player.profile 
        p_black = black_player.profile

        old_w_elo = p_white.elo
        old_b_elo = p_black.elo

        winner_user = None

        is_draw = (winner_color is None)

        if is_draw:
            new_w, new_b = update_ratings(p_white.elo, p_black.elo, is_draw=True)
            p_white.draws += 1
            p_black.draws += 1
            winner_user = None
        elif winner_color == 'b':
            new_w, new_b = update_ratings(p_white.elo, p_black.elo, is_draw=False)
            p_white.wins += 1
            p_black.losses += 1
            winner_user = white_player
        else: # winner == 'c'
            new_b, new_w = update_ratings(p_black.elo, p_white.elo, is_draw=False)
            p_black.wins += 1
            p_white.losses += 1
            winner_user = black_player

        p_white.elo = new_w
        p_black.elo = new_b
        
        p_white.save()
        p_black.save()

        state_dict = json.loads(game.state) if game.state else {}
        move_list = state_dict.get('moves', [])

        GameHistory.objects.create(
            white_player=white_player,
            black_player=black_player,
            winner=winner_user,
            white_elo=old_w_elo,
            black_elo=old_b_elo,
            reason=reason,
            moves=move_list
        )
        
    except Exception as e:
        print(f"Błąd aktualizacji ELO: {e}")

@database_sync_to_async
def process_game_result(room_name, winner_color, reason):
    return process_game_result_sync(room_name, winner_color, reason)

def _serialize_room(room):
    return {
        'name': room.name,
        'players': [p.username or str(p.id) for p in room.players.all()],
        'players_count': room.players_count,
        'has_password': bool(room.password_hash),
        'status': room.status,
    }


@database_sync_to_async
def check_game_timeout(room_name):
    """
    Sprawdza, czy czas gracza na turze się skończył.
    Jeśli tak -> aktualizuje stan w bazie i zwraca nowy stan.
    Jeśli nie -> zwraca None.
    """
    try:
        game = Game.objects.get(room_name=room_name)
        if not game.state:
            return None
            
        state = json.loads(game.state)
        
        # Jeśli gra już się skończyła, nic nie rób
        if state.get("game_over"):
            return None

        # Pobierz dane o czasie
        turn = state.get("turn", "b")
        last_move_ts = state.get("last_move_timestamp", time.time())
        moves_history = state.get("moves", [])
        
        # Czas nie płynie przed pierwszym ruchem
        if len(moves_history) == 0:
            return None

        now = time.time()
        elapsed = now - last_move_ts
        
        timeout_occurred = False
        
        # Sprawdzamy czy czas minął (z małym buforem np. 0.5s na lagi)
        if turn == 'b':
            remaining = state.get("white_time", 600) - elapsed
            if remaining <= 0:
                state["white_time"] = 0
                state["winner"] = "c" # Wygrywają czarne
                timeout_occurred = True
        else:
            remaining = state.get("black_time", 600) - elapsed
            if remaining <= 0:
                state["black_time"] = 0
                state["winner"] = "b" # Wygrywają białe
                timeout_occurred = True
        
        if timeout_occurred:
            state["game_over"] = True
            state["reason"] = "timeout"
            winner_col = state["winner"]
            process_game_result_sync(room_name, winner_col, 'timeout')
            # Zapisujemy zmianę w bazie
            game.state = json.dumps(state)
            game.save(update_fields=["state", "updated_at"])
            return state
            
        return None

    except Game.DoesNotExist:
        return None
    except Exception as e:
        print(f"Error checking timeout: {e}")
        return None


# --- CONSUMERS ---

class ChessGameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.timer_task = None

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

            if not self.timer_task:
                self.timer_task = asyncio.create_task(self._game_timer_loop())

        except Exception:
            logger.exception("Error during connect")
            await self.send_json({"type": "error", "detail": "server error during connect"})

    async def disconnect(self, close_code):
        if self.timer_task:
            self.timer_task.cancel()
            try:
                await self.timer_task
            except asyncio.CancelledError:
                pass
            self.timer_task = None

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
        
        elif msg_type == "resign":
            await self._handle_resign(user)

        # --- NOWE: PROPOZYCJA REMISU ---
        elif msg_type == "offer_draw":
            # Przesyłamy propozycję do przeciwnika (nie zapisujemy w stanie trwałym, to ulotne)
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "draw_offered",
                    "sender": str(user),
                    "sender_id": user.id
                }
            )

        # --- NOWE: ODPOWIEDŹ NA REMIS (accept/reject) ---
        elif msg_type == "respond_draw":
            accept = data.get("accept", False)
            if accept:
                await self._handle_draw_agreed()
            else:
                # Opcjonalnie: powiadom drugiego gracza o odrzuceniu
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "draw_rejected", "sender": str(user)}
                )

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

    async def _game_timer_loop(self):
        """
        Działa w tle i co sekundę sprawdza, czy czas gracza minął.
        """
        while True:
            try:
                # Sprawdzamy co 1 sekundę
                await asyncio.sleep(1)
                
                # Sprawdź w bazie czy nastąpił timeout
                timeout_state = await check_game_timeout(self.room_name)
                
                if timeout_state:
                    # Jeśli tak -> wyślij Game Over do wszystkich
                    await self.channel_layer.group_send(
                        self.group_name,
                        {
                            "type": "broadcast_game_over", 
                            "state": timeout_state
                        }
                    )
                    # Skoro gra się skończyła, przerywamy pętlę monitorowania
                    break
                    
            except asyncio.CancelledError:
                # Zadanie zostało anulowane przy disconnect
                break
            except Exception as e:
                # Logujemy błąd, ale nie przerywamy pętli (żeby timer nie padł przez jeden błąd)
                print(f"Timer loop error: {e}")
                await asyncio.sleep(5) # Odczekaj chwilę przed retry

    async def _handle_resign(self, user):
        """Gracz się poddaje -> przeciwnik wygrywa."""
        # 1. Pobierz aktualny stan
        game = await database_sync_to_async(Game.objects.get)(room_name=self.room_name)
        state_dict = json.loads(game.state) if game.state else {}

        # Jeśli gra już skończona, ignoruj
        if state_dict.get("game_over"):
            return

        # 2. Ustal kolory
        room = await database_sync_to_async(Room.objects.get)(name=self.room_name)
        players = await database_sync_to_async(list)(room.players.all().order_by('id'))
        
        # Zakładamy: players[0]=Białe, players[1]=Czarne (zgodnie z logiką z poprzednich plików)
        # Ustalmy kto wygrał
        winner_color = None
        if len(players) >= 2:
            if user.id == players[0].id:
                winner_color = 'c' # Biały się poddał -> czarny wygrywa
            elif user.id == players[1].id:
                winner_color = 'b' # Czarny się poddał -> biały wygrywa

        if winner_color:
            state_dict['game_over'] = True
            state_dict['winner'] = winner_color
            state_dict['reason'] = 'resignation'
            
            # Zapisz stan
            game.state = json.dumps(state_dict)
            await database_sync_to_async(game.save)()

            # Aktualizuj ELO
            await process_game_result(self.room_name, winner_color, 'resignation')

            # Broadcast
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "broadcast_game_over", "state": state_dict}
            )

    async def _handle_draw_agreed(self):
        """Gracze zgodzili się na remis."""
        game = await database_sync_to_async(Game.objects.get)(room_name=self.room_name)
        state_dict = json.loads(game.state) if game.state else {}

        if state_dict.get("game_over"):
            return

        # Aktualizacja stanu
        state_dict['game_over'] = True
        state_dict['winner'] = None # Remis
        state_dict['reason'] = 'agreement' # draw by agreement

        game.state = json.dumps(state_dict)
        await database_sync_to_async(game.save)()

        await process_game_result(self.room_name, None, 'agreement')

        await self.channel_layer.group_send(
            self.group_name,
            {"type": "broadcast_game_over", "state": state_dict}
        )

    # --- EVENT HANDLERS (do wysyłania JSON do klienta) ---

    async def draw_offered(self, event):
        # Wysyłamy info o propozycji remisu.
        # Frontend musi sprawdzić, czy to "ja" wysłałem, czy przeciwnik.
        await self.send_json({
            "type": "draw_offer",
            "sender": event["sender"],
            "sender_id": event["sender_id"]
        })

    async def draw_rejected(self, event):
        await self.send_json({
            "type": "draw_rejected",
            "sender": event["sender"]
        })

    async def broadcast_game_over(self, event):
        # Nadpisujemy stan na froncie nowym stanem z flagą game_over
        await self.send_json({
            "type": "game_over",
            "state": event["state"]
        })

    # Helpery Sync/Async (bez zmian logiki gry)
    def _apply_move_sync(self, move_data: dict):
        try:
            game, created = Game.objects.get_or_create(room_name=self.room_name)
            if created or not game.state:
                game.state = EngineWrapper.get_initial_state()

            current_state_dict = json.loads(game.state)
            
            # Sprawdź czy gra się już nie skończyła
            if current_state_dict.get('game_over'):
                return False, "Game is already over"
            
            turn = current_state_dict.get('turn', 'b') # 'b' to białe w Twoim silniku, 'c' czarne
            moves_history = current_state_dict.get('moves', [])
            
            # --- LOGIKA CZASU ---
            now = time.time()
            last_time = current_state_dict.get('last_move_timestamp', now)
            # Odejmujemy czas tylko jeśli to NIE jest pierwszy ruch w grze
            # (można też odejmować zawsze, ale wtedy biały traci czas czekając na start)
            if len(moves_history) > 0:
                time_delta = now - last_time
                
                if turn == 'b': # Białe robiły ruch, więc im odejmujemy
                    current_state_dict['white_time'] -= time_delta
                else:
                    current_state_dict['black_time'] -= time_delta

            # Sprawdzenie przegranej na czas (Timeout)
            w_time = current_state_dict['white_time']
            b_time = current_state_dict['black_time']
            
            if w_time <= 0 or b_time <= 0:
                # KONIEC GRY PRZEZ CZAS
                current_state_dict['white_time'] = max(0, w_time)
                current_state_dict['black_time'] = max(0, b_time)
                current_state_dict['game_over'] = True
                current_state_dict['reason'] = 'timeout'
                # Jeśli czas skończył się białym (w_time <= 0), wygrywają czarne ('c')
                current_state_dict['winner'] = 'c' if w_time <= 0 else 'b'
                
                # Zapisujemy i zwracamy info o końcu
                game.state = json.dumps(current_state_dict)
                game.save(update_fields=["state", "updated_at"])
                
                return True, {
                    "type": "game_over", # Specjalny typ ruchu, frontend musi to obsłużyć lub po prostu odświeżyć stan
                    "state": current_state_dict
                }

            # 2. Jeśli czas jest OK, aplikujemy ruch w silniku
            # Musimy przekazać zaktualizowany o czasy stan do walidacji (choć EngineWrapper może nadpisać strukturę)
            # Najlepiej wywołać walidację na JSON stringu, a potem do wyniku DOKLEIĆ czasy.
            
            # Serializujemy zaktualizowany czasowo stan, żeby EngineWrapper miał aktualne dane (choć on głównie patrzy na planszę)
            temp_state_str = json.dumps(current_state_dict)

            valid, new_state_str, info = EngineWrapper.validate_and_apply(temp_state_str, move_data)

            if not valid:
                err = info.get("error") if isinstance(info, dict) else str(info)
                return False, err or "illegal move"
            
            new_state_dict = json.loads(new_state_str)
            
            # Przenosimy obliczone czasy do nowego stanu
            new_state_dict['white_time'] = current_state_dict['white_time']
            new_state_dict['black_time'] = current_state_dict['black_time']
            new_state_dict['last_move_timestamp'] = now # Aktualizujemy czas ostatniego ruchu na TERAZ

            # Sprawdzenie mata/pata z silnika (EngineWrapper to ustawia, ale upewnijmy się)
            if new_state_dict.get('checkmate'):
                new_state_dict['game_over'] = True
                new_state_dict['reason'] = 'checkmate'
                winner = turn
                new_state_dict['winner'] = winner
                
                process_game_result_sync(self.room_name, winner, 'checkmate') # Wywołanie sync

            elif new_state_dict.get('stalemate'):
                new_state_dict['game_over'] = True
                new_state_dict['reason'] = 'stalemate'
                new_state_dict['winner'] = None
                process_game_result_sync(self.room_name, None, 'stalemate')

            # Zapis do bazy
            game.state = json.dumps(new_state_dict)
            game.save(update_fields=["state", "updated_at"])

            payload = {
                "uci": info.get("uci", move_data),
                "info": info,
                "state": new_state_dict, # Tu poleci pełny stan z czasami
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
            # Pobieramy grę po nazwie pokoju (używamy self.room_name)
            game = Game.objects.get(room_name=self.room_name)
            
            players = []
            
            if game.white_player:
                players.append(game.white_player.username)

            # 2. Dodaj Czarnego (Gość)
            if game.black_player:
                players.append(game.black_player.username)
            
            return players

        except (Game.DoesNotExist, Room.DoesNotExist):
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

        if typ == 'quick_match':
            if user.is_anonymous:
                await self.send_json({'type': 'error', 'message': 'auth required'})
                return

            # 1. Próba znalezienia istniejącego pokoju
            existing_room = await find_open_room_for_quick_match(user.id)

            if existing_room:
                # Próbujemy dołączyć używając istniejącej logiki
                res = await try_join_room_db(existing_room.name, user.id, "")
                if res['success']:
                    # Udało się dołączyć
                    await self.channel_layer.group_send("lobby", {
                        "type": "lobby.room_update",
                        "room": res['room']
                    })
                    await self.send_json({'type': 'joined', 'room': res['room'], 'success': True})
                    return
                # Jeśli z jakiegoś powodu się nie udało (np. ułamek sekundy temu ktoś wbił), 
                # kod przejdzie dalej i stworzy nowy pokój.

            # 2. Tworzenie nowego pokoju (jeśli nie znaleziono lub dołączenie nie wyszło)
            # Generujemy losową nazwę, np. QuickMatch_a1b2c3d4
            random_suffix = uuid.uuid4().hex[:8]
            name = f"QuickMatch_{random_suffix}"
            
            room_obj = await create_room_db(name, user.id, "") # puste hasło

            # Broadcast do lobby
            await self.channel_layer.group_send("lobby", {
                "type": "lobby.room_created",
                "room": room_obj
            })
            
            # Info dla gracza, że dołączył (do swojego pokoju)
            await self.send_json({
                'type': 'joined', 
                'room': room_obj, 
                'success': True
            })
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
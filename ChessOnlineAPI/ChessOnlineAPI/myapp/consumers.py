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
        self.group_name = f"game_{self.room_name}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        logger.info("Client connected: room=%s channel=%s user=%s", self.room_name, self.channel_name, self.scope.get("user"))

        try:
            await self._ensure_game_exists()
            state = await self._get_state()
            await self.send_json({"type": "connected", "room": self.room_name, "state": state})
        except Exception:
            tb = traceback.format_exc()
            logger.exception("Error during connect: %s", tb)
            await self.send_json({"type":"error","detail":"server error during connect"})

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("Client disconnected: room=%s channel=%s", self.room_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        logger.debug("Received raw: %s", text_data)
        try:
            data = json.loads(text_data)
        except Exception:
            logger.warning("Invalid JSON received: %s", text_data)
            await self.send_json({"type":"error", "detail":"invalid json"})
            return

        t = data.get("type")
        if t == "move":
            move = data.get("move")
            if not move:
                await self.send_json({"type":"error","detail":"no move provided"})
                return

            logger.info("Move requested: %s by user=%s in room=%s", move, self.scope.get("user"), self.room_name)

            loop = asyncio.get_running_loop()
            func = functools.partial(self._apply_move_sync, move)
            result = await loop.run_in_executor(None, func)

            success, payload_or_err = result
            if success:
                logger.info("Move applied successfully: %s", move)
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "broadcast_move", "move": payload_or_err}
                )
            else:
                logger.info("Move rejected: %s reason=%s", move, payload_or_err)
                await self.send_json({"type":"error","detail": payload_or_err})
        elif t == "sync_request":
            state = await self._get_state()
            await self.send_json({"type":"sync", "state": state})
        elif t == "chat":
            msg = data.get("message", "")
            logger.info("Chat in room %s: %s", self.room_name, msg)
            await self.channel_layer.group_send(self.group_name, {"type":"broadcast_chat", "message": msg, "sender": str(self.scope.get("user") or "anon")})
        else:
            logger.warning("Unknown message type: %s", t)
            await self.send_json({"type":"error","detail":"unknown message type"})

    async def broadcast_move(self, event):
        await self.send_json({"type":"move", "move": event["move"]})

    async def broadcast_chat(self, event):
        await self.send_json({"type":"chat", "message": event["message"], "sender": event.get("sender")})

    def _apply_move_sync(self, move_notation: str):
        try:
            logger.debug("_apply_move_sync start for move=%s room=%s", move_notation, self.room_name)
            game, created = Game.objects.get_or_create(room_name=self.room_name)
            if created or not game.state:
                game.state = EngineWrapper.get_initial_state()

            valid, new_state, info = EngineWrapper.validate_and_apply(game.state, move_notation)
            if not valid:
                err = info.get("error") if isinstance(info, dict) else str(info)
                logger.debug("Engine rejected move=%s error=%s", move_notation, err)
                return False, err or "illegal move"

            game.state = new_state
            game.append_move(move_notation)
            game.save(update_fields=["state", "moves", "updated_at"])

            payload = {
                "uci": info.get("uci", move_notation),
                "info": info,
                "state": json.loads(new_state),
                "moves": game.moves.splitlines() if game.moves else []
            }
            logger.debug("_apply_move_sync success payload=%s", payload)
            return True, payload
        except Exception as e:
            tb = traceback.format_exc()
            logger.exception("Exception in _apply_move_sync: %s", tb)
            # write raw traceback to file as well (if you want)
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
        return {"state": obj, "moves": game.moves.splitlines() if game.moves else []}

    async def send_json(self, data):
        await self.send(text_data=json.dumps(data))

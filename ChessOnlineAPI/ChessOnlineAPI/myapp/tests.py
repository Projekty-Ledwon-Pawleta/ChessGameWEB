# test_ws_move.py
import asyncio
import websockets
import json

async def run():
    uri = "ws://127.0.0.1:8000/ws/game/testroom/"
    async with websockets.connect(uri) as ws:
        print("connected")
        # receive connected message
        msg = await ws.recv()
        print("recv:", msg)

        # send a move in your engine's user_notation format
        # replace "e2e4" with one of legal moves returned earlier by GET (or sync)
        await ws.send(json.dumps({"type":"move", "move":"e5"}))

        # receive broadcast for this move (and maybe other messages)
        reply = await ws.recv()
        print("recv:", reply)

asyncio.run(run())

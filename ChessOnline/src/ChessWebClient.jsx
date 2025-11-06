// FILE: src/ChessWebClient.jsx
import React, { useEffect, useRef, useState } from "react";
import pieceMap from "./pieceMap";
import './index.css'

const PIECE_SHORT = {
  Wieza: "W",
  Skoczek: "S",
  Goniec: "G",
  Hetman: "H",
  Krol: "K",
  Pionek: "P",
};

function prettySquareName(row, col) {
  const files = "abcdefgh";
  const ranks = "87654321";
  return `${files[col]}${ranks[row]}`;
}

export default function ChessWebClient({ defaultRoom = "testroom", wsHost = "ws://localhost:8000" }) {
  const [room, setRoom] = useState(defaultRoom);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stateObj, setStateObj] = useState({ state: { board: [], moves: [] }, moves: [] });
  const [moveInput, setMoveInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    }
  }, [])

  function log(...args) {
    const s = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    setLogs(l => ["[" + new Date().toLocaleTimeString() + "] " + s, ...l].slice(0, 200));
    console.log(...args);
  }

  function buildUrl(roomName) {
    return `${wsHost}/ws/game/${encodeURIComponent(roomName)}/`;
  }

  function connect() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const url = buildUrl(room);
    log("Connecting to", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      log("WebSocket open");
      setConnected(true);
      ws.send(JSON.stringify({ type: "sync_request" }));
    };

    ws.onmessage = ev => {
      try {
        const data = JSON.parse(ev.data);
        log("<", data);
        handleMessage(data);
      } catch (e) {
        log("Malformed message", ev.data);
      }
    };

    ws.onclose = ev => {
      log("WebSocket closed", ev.code, ev.reason);
      setConnected(false);
      wsRef.current = null;
      reconnectRef.current = setTimeout(() => { log("Reconnecting..."); connect(); }, 2000);
    };

    ws.onerror = err => { log("WebSocket error", err && err.message ? err.message : err); };
  }

  function disconnect() { if (wsRef.current) wsRef.current.close(); setConnected(false); log("Disconnected by user"); }

  function handleMessage(msg) {
    const t = msg.type;
    if (t === "connected") {
      log("Connected to room", msg.room);
      if (msg.state) setStateObj(prev => ({ ...prev, ...msg.state }));
    } else if (t === "sync") {
      if (msg.state) setStateObj(prev => ({ ...prev, ...msg.state }));
    } else if (t === "move") {
      if (msg.move) {
        if (msg.move.state) setStateObj(prev => ({ ...prev, state: msg.move.state, moves: msg.move.state.moves || prev.moves }));
        else if (msg.move.moves) setStateObj(prev => ({ ...prev, moves: msg.move.moves }));
      }
    } else if (t === "chat") { log(`CHAT ${msg.sender}: ${msg.message}`); }
    else if (t === "error") { log("ERROR", msg.detail); }
    else { log("Unhandled message type:", msg); }
  }

  function sendMove() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { log("Not connected"); return; }
    if (!moveInput || moveInput.trim() === "") return;
    const payload = { type: "move", move: moveInput.trim() };
    log(">", payload);
    wsRef.current.send(JSON.stringify(payload));
    setMoveInput("");
  }

  function sendChat() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { log("Not connected"); return; }
    if (!chatInput.trim()) return;
    const payload = { type: "chat", message: chatInput.trim() };
    log(">", payload);
    wsRef.current.send(JSON.stringify(payload));
    setChatInput("");
  }

  const board = (stateObj && stateObj.state && stateObj.state.board) || [];
  const moves = (stateObj && (stateObj.moves || (stateObj.state && stateObj.state.moves))) || [];

  return (
    <div className="p-4 max-w-5xl mx-auto bg-white rounded shadow">
      <div className="mb-4 flex gap-2 items-center">
        <input className="border p-2 rounded" value={room} onChange={e => setRoom(e.target.value)} />
        <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={connect} disabled={connected}>Connect</button>
        <button className="bg-gray-300 px-3 py-2 rounded" onClick={disconnect} disabled={!connected}>Disconnect</button>
        <div className="ml-auto">Status: <span className={`${connected ? 'text-green-600' : 'text-red-600'} font-semibold`}>{connected ? 'connected' : 'disconnected'}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="bg-gray-100 p-3 rounded">
            <div className="grid grid-cols-8 gap-0 border border-gray-300">
              {Array.from({ length: 8 }).map((_, r) => (
                <React.Fragment key={r}>
                  {Array.from({ length: 8 }).map((__, c) => {
                    const piece = board[r] && board[r][c];
                    const pieceKey = piece ? piece.replace(/\s+/g, '') : null; // e.g. "Goniec" => "Goniec"
                    const imgSrc = pieceKey ? pieceMap[pieceKey] : null;
                    const short = piece ? (PIECE_SHORT[piece] || piece[0]) : null;
                    const squareName = prettySquareName(r, c);
                    const isLight = (r + c) % 2 === 0;
                    return (
                      <div key={c} className={`w-12 h-12 flex items-center justify-center text-sm font-medium ${isLight ? 'bg-yellow-50' : 'bg-green-600 text-white' } border`} title={squareName}>
                        <div className="text-center">
                          {imgSrc ? <img src={imgSrc} alt={piece} className="w-8 h-8 object-contain" /> : <div>{short}</div>}
                          <div className="text-xs opacity-75">{squareName}</div>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="mt-3 bg-white p-3 rounded border">
            <div className="mb-2 font-semibold">Send move</div>
            <div className="flex gap-2">
              <input className="border p-2 rounded flex-1" value={moveInput} onChange={e => setMoveInput(e.target.value)} placeholder="e.g. e4 or d5" />
              <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={sendMove}>Send</button>
            </div>
            <div className="mt-2 text-sm text-gray-600">Use notation expected by the server (example: e4, d5, ...). The client will send: {`{"type":"move","move":"..."}`}</div>
          </div>

        </div>

        <div>
          <div className="bg-white p-3 rounded border mb-3">
            <div className="font-semibold mb-2">Moves</div>
            <ol className="list-decimal list-inside text-sm">
              {moves && moves.length ? moves.map((m, i) => <li key={i}>{m}</li>) : <li className="text-gray-500">No moves</li>}
            </ol>
          </div>

          <div className="bg-white p-3 rounded border mb-3">
            <div className="font-semibold mb-2">Chat</div>
            <div className="flex gap-2 mb-2">
              <input className="border p-2 rounded flex-1" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Write message..." />
              <button className="bg-indigo-600 text-white px-3 py-2 rounded" onClick={sendChat}>Send</button>
            </div>
            <div className="text-xs text-gray-500">Server broadcasts chat messages to group</div>
          </div>

          <div className="bg-white p-3 rounded border">
            <div className="font-semibold mb-2">Debug log (latest first)</div>
            <div className="h-56 overflow-y-auto text-xs font-mono bg-gray-50 p-2">
              {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// src/components/ChessWebClient.jsx
import React, { useEffect, useRef, useState } from 'react';
import wsClient from '../api/wsClient';
import pieceMap from './pieceMap';
import '../index.css';

export default function ChessWebClient({ defaultRoom = 'testroom', wsHost }) {
  const [room, setRoom] = useState(defaultRoom);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stateObj, setStateObj] = useState({ state: { board: [], moves: [] }, moves: [] });
  const [moveInput, setMoveInput] = useState('');
  const [chatInput, setChatInput] = useState('');

  // optional ref to keep scroll at bottom for logs
  const logRef = useRef(null);

  useEffect(() => {
    const unsubOpen = wsClient.on('open', () => { addLog('WebSocket open'); setConnected(true); });
    const unsubClose = wsClient.on('close', () => { addLog('WebSocket closed'); setConnected(false); });
    const unsubMessage = wsClient.on('message', (m) => { addLog('<message> ' + JSON.stringify(m)); });
    const unsubConnected = wsClient.on('connected', (m) => {
      addLog('connected to room ' + m.room);
      if (m.state) setStateObj(prev => ({ ...prev, ...m.state }));
    });

    const unsubMove = wsClient.on('move', (m) => {
      addLog('move message received: ' + JSON.stringify(m.move || m));
      if (m.move && m.move.state) {
        setStateObj(prev => ({ ...prev, state: m.move.state, moves: m.move.state.moves || prev.moves }));
      } else if (m.move && m.move.moves) {
        setStateObj(prev => ({ ...prev, moves: m.move.moves }));
      }
    });
    const unsubChat = wsClient.on('chat', (m) => { addLog(`CHAT ${m.sender || 'server'}: ${m.message}`); });

    return () => {
      unsubOpen(); unsubClose(); unsubMessage(); unsubConnected(); unsubMove(); unsubChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // auto-scroll logs to top (we keep newest first) - optional visual tweak
    if (logRef.current) {
      // nothing required since newest are at top; keep for future tweaks
    }
  }, [logs]);

  function addLog(s) {
    setLogs(l => ['[' + new Date().toLocaleTimeString() + '] ' + s, ...l].slice(0, 200));
    console.log(s);
  }

  function connect() {
    try {
      wsClient.connect({ host: wsHost, room });
      addLog('Connecting to ' + room);
    } catch (e) {
      addLog('Connect error: ' + (e && e.message ? e.message : String(e)));
    }
  }
  function disconnect() { wsClient.disconnect(); }

  function sendMove() {
    if (!moveInput.trim()) return;
    const payload = { type: 'move', move: moveInput.trim() };
    addLog('> ' + JSON.stringify(payload));
    wsClient.send(payload);
    setMoveInput('');
  }
  function sendChat() {
    if (!chatInput.trim()) return;
    const payload = { type: 'chat', message: chatInput.trim() };
    addLog('> ' + JSON.stringify(payload));
    wsClient.send(payload);
    setChatInput('');
  }

  const board = (stateObj && stateObj.state && stateObj.state.board) || [];
  const moves = (stateObj && (stateObj.moves || (stateObj.state && stateObj.state.moves))) || [];

  // helper: normalize piece key for pieceMap lookup
  function pieceKeyFromName(piece) {
    if (!piece) return null;
    return piece.replace(/\s+/g, '');
  }

  function inferColorFromRow(row) {
    if (row <= 1) return 'c';
    if (row >= 6) return 'b';
    return null;
  }

  function normalizedPieceKey(piece, row) {
    if (!piece) return null;
    const cleaned = String(piece).replace(/\s+/g, '');
    if (/^[bc]/.test(cleaned)) return cleaned;
    const inferred = inferColorFromRow(row);
    if (inferred) return inferred + cleaned;
    if (pieceMap['b' + cleaned]) return 'b' + cleaned;
    if (pieceMap['c' + cleaned]) return 'c' + cleaned;
    return cleaned;
  }

  // small board cell renderer (same look as earlier)
  function renderBoardGrid() {
    // if board is empty (server not synced), show an 8x8 empty placeholder
    const rows = board && board.length === 8 ? board : Array.from({ length: 8 }).map(() => Array(8).fill(null));
    return (
      <div className="bg-gray-100 p-3 rounded">
        <div className="grid grid-cols-8 gap-0 border border-gray-300">
          {rows.map((rowArr, r) => (
            <React.Fragment key={r}>
              {rowArr.map((cell, c) => {
                const piece = cell;
                const pieceKey = piece ? normalizedPieceKey(piece, r) : null;
                const imgSrc = pieceKey ? pieceMap[pieceKey] : null;
                if (piece && !imgSrc) {
                  // eslint-disable-next-line no-console
                  console.warn('Missing piece image for key:', pieceKey, 'orig:', piece, 'row:', r);
                }
                const short = piece ? (piece[0] || piece) : null;
                const squareName = (() => {
                  const files = "abcdefgh";
                  const ranks = "87654321";
                  return `${files[c]}${ranks[r]}`;
                })();
                const isLight = (r + c) % 2 === 0;
                return (
                  <div key={c} className={`w-12 h-12 flex items-center justify-center text-sm font-medium ${isLight ? 'bg-yellow-50' : 'bg-green-600 text-white'} border`} title={squareName}>
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
    );
  }

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
          {renderBoardGrid()}

          <div className="mt-3 bg-white p-3 rounded border">
            <div className="mb-2 font-semibold">Send move</div>
            <div className="flex gap-2">
              <input className="border p-2 rounded flex-1" value={moveInput} onChange={e => setMoveInput(e.target.value)} placeholder="e.g. e2e4 or e2 e4" />
              <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={sendMove}>Send</button>
            </div>
            <div className="mt-2 text-sm text-gray-600">Use notation expected by the server (example: e2e4). The client will send: {"{"}"type":"move","move":"..."{"}"}.</div>
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
            <div ref={logRef} className="h-56 overflow-y-auto text-xs font-mono bg-gray-50 p-2">
              {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

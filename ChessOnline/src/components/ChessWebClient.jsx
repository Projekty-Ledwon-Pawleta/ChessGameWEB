// src/components/ChessWebClient.jsx
import React, { useEffect, useRef, useState } from 'react';
import wsClient from '../api/wsClient';
import '../index.css';

export default function ChessWebClient({ defaultRoom = 'testroom', wsHost }) {
  const [room, setRoom] = useState(defaultRoom);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState([]);
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

  return (
    <div className="p-4 max-w-5xl mx-auto bg-white rounded shadow">
      <div className="mb-4 flex gap-2 items-center">
        <input className="border p-2 rounded" value={room} onChange={e => setRoom(e.target.value)} />
        <div className="ml-auto">Status: <span className={`${connected ? 'text-green-600' : 'text-red-600'} font-semibold`}>{connected ? 'connected' : 'disconnected'}</span></div>
      </div>
    </div>
  );
}

// src/pages/RoomsPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import wsClient from "../api/wsClient";
import "../styles/rooms.css"; // stwórz style wg siebie

function RoomListItem({ room, onJoin }) {
  return (
    <div className="room-card">
      <div className="room-card__left">
        <div className="room-card__name">{room.name}</div>
        
        <div className="room-card__players" style={{ fontSize: '0.9rem', marginTop: 4, color: '#4b5563' }}>
            {room.players && room.players.length > 0 ? (
                room.players.map((p, i) => (
                    <span key={p.username}>
                        {i > 0 && ", "}
                        <span style={{fontWeight: 600}}>{p.username}</span> 
                        <span style={{color: '#0f9d58', fontSize: '0.85em', marginLeft: 2}}>({p.elo})</span>
                    </span>
                ))
            ) : (
                <span style={{fontStyle: 'italic', color: '#9ca3af'}}>Pusty pokój</span>
            )}
        </div>

        <div className="room-card__meta" style={{ marginTop: 4, fontSize: '0.8rem' }}>
          {room.players_count ?? 0}/2 graczy
          {room.has_password ? " • 🔒 Hasło" : ""}
          {room.status ? ` • ${room.status}` : ""}
        </div>
      </div>
      
      <div className="room-card__actions">
        <button className="btn" onClick={() => onJoin(room)}>Dołącz</button>
      </div>
    </div>
  );
}

export default function RoomsPage({ wsHost }) {
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]); // array of room objects
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPass, setNewRoomPass] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Connect to lobby on mount
    try {
      wsClient.connect({ host: wsHost, room: "lobby" });
    } catch (e) {
      console.warn("Lobby connect failed:", e);
      setError("Nie udało się połączyć z serwerem lobby.");
    }

    const unsubOpen = wsClient.on("open", () => {
      setConnected(true);
      // ask for current room list
      wsClient.send({ type: "lobby_subscribe" });
    });
    const unsubClose = wsClient.on("close", () => setConnected(false));

    const unsubRoomList = wsClient.on("room_list", (msg) => {
      const arr = msg?.rooms ?? msg?.data ?? [];
      setRooms(Array.isArray(arr) ? arr : []);
      setLoading(false);
    });

    const unsubRoomUpdate = wsClient.on("room_update", (msg) => {
      // msg.room = {name, players, max_players, has_password, status}
      const r = msg?.room;
      if (!r) return;
      setRooms((prev) => {
        const idx = prev.findIndex(x => x.name === r.name);
        if (idx === -1) return [r, ...prev];
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...r };
        return copy;
      });
    });

    const unsubRoomCreated = wsClient.on("room_created", (msg) => {
      // server confirms created room and often broadcasts a new room_list
      const roomObj = msg?.room;
      if (roomObj) setRooms(prev => [roomObj, ...prev.filter(r=>r.name!==roomObj.name)]);
    });
    
    const unsubJoined = wsClient.on("joined", (msg) => {
      const roomObj = msg?.room;
      const ok = msg?.success !== false;

      if (!ok || !roomObj?.name) {
        setError(msg?.message || "Nie udało się dołączyć");
        return;
      }

      const roomName = roomObj.name;

      try {
        wsClient.disconnect();
        wsClient.connect({ host: wsHost, room: roomName });
      } catch (e) {}

      navigate(`/play/${encodeURIComponent(roomName)}`);
    });

    const unsubError = wsClient.on("error", (m) => {
      console.error("ws error", m);
    });

    return () => {
      unsubOpen(); unsubClose();
      unsubRoomList(); unsubRoomUpdate(); unsubRoomCreated(); unsubJoined();
      unsubError();
      // don't disconnect here if other parts of the app rely on wsClient. If you want to disconnect:
      try { wsClient.disconnect(); } catch(e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateRoom(e) {
    e.preventDefault();
    if (!newRoomName) {
      setError("Wprowadź nazwę pokoju");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      wsClient.send({
        type: "create_room",
        name: newRoomName,
        password: newRoomPass || "",
      });
      setNewRoomName("");
      setNewRoomPass("");
    } catch (err) {
      console.error(err);
      setError("Błąd tworzenia pokoju");
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(room) {
    setError(null);
    if (room.has_password) {
      const pass = window.prompt(`Ten pokój jest chroniony hasłem. Podaj hasło dla pokoju "${room.name}":`);
      if (pass === null) return; // cancelled
      wsClient.send({ type: "join_room", name: room.name, password: pass });
    } else {
      wsClient.send({ type: "join_room", name: room.name, password: "" });
    }
    // actual navigation happens on server 'joined' message
  }

  const filteredRooms = rooms.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

 return (
    <div className="container p-4">
      <div className="lobby-header">
        <h2>Lobby pokoi</h2>
        <div>Status: {connected ? <span style={{color:'green'}}>połączono</span> : <span style={{color:'red'}}>rozłączono</span>}</div>
      </div>

      <section className="create-room p-2">
        <h3>Utwórz pokój</h3>
        <form onSubmit={handleCreateRoom} className="create-room__form">
          <input placeholder="Nazwa pokoju" value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} />
          <input placeholder="Hasło (opcjonalne)" value={newRoomPass} onChange={e=>setNewRoomPass(e.target.value)} />
          <button className="btn btn--primary" type="submit" disabled={creating}>Utwórz</button>
        </form>
      </section>

      <section className="rooms-list p-2" style={{marginTop:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <h3>Dostępne pokoje</h3>
            {/* WYSZUKIWARKA */}
            <input 
                placeholder="Szukaj pokoju..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e6eef2',
                    fontSize: '14px',
                    width: '200px'
                }}
            />
        </div>

        {loading ? <div>Ładowanie listy pokoi…</div> : null}
        {error && <div style={{color:'crimson'}}>{error}</div>}
        
        {!loading && filteredRooms.length === 0 && (
            <div style={{color: '#666', fontStyle: 'italic'}}>
                {searchTerm ? "Nie znaleziono pokoju o tej nazwie." : "Brak dostępnych pokoi. Stwórz nowy!"}
            </div>
        )}

        <div className="rooms-grid">
          {filteredRooms.map(r => (
            <RoomListItem key={r.name} room={r} onJoin={handleJoin} />
          ))}
        </div>
      </section>
    </div>
  );
}

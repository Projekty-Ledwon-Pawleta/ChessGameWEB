// src/api/wsClient.js
const defaultHost = 'ws://localhost:8000';

class WSClient {
  constructor() {
    this.ws = null;
    this.host = defaultHost;
    this.room = null;
    this.connected = false;
    this.reconnectTimeout = null;
    this.listeners = new Map();
    this.reconnectDelay = 2000;
  }

  // teraz dodajemy token do URL
  buildUrl(room) {
    const token = localStorage.getItem('access_token');
    if (!token) throw new Error('No access token found');

    // Dla lobby nie dodawaj dodatkowego "room" w URL
    if (room === "lobby") {
      return `${this.host}/ws/lobby/?token=${token}`;
    }

    return `${this.host}/ws/game/${encodeURIComponent(room)}/?token=${token}`;
  }

  connect({ host, room } = {}) {
    if (host) this.host = host;
    if (room) this.room = room;

    if (!this.room) throw new Error('room required to connect');

    // 1. Zabezpieczenie przed nadpisywaniem:
    // Zanim otworzymy nowe, zamykamy stare i CZYŚCIMY jego callbacki,
    // żeby stare onclose nie odpaliło się, gdy my już tworzymy nowe połączenie.
    if (this.ws) {
      // Usuwamy listenery ze starego socketa, żeby nie śmieciły
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      
      try { this.ws.close(); } catch(e) {}
      this.ws = null;
    }

    const url = this.buildUrl(this.room);
    if (!url) {
      this.emit('auth_required', { message: 'No access token found' });
      return;
    }

    const access = localStorage.getItem('access_token');
    if (!access) {
      this.emit('auth_required', { message: 'No access token found' });
      return;
    }

    // Tworzymy nową instancję
    const socket = new WebSocket(url);
    this.ws = socket;

    socket.onopen = () => {
      // Sprawdź czy ten socket to nadal "TEN" aktualny socket
      if (this.ws !== socket) return; 

      this.connected = true;
      this.emit('open');
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    socket.onmessage = (ev) => {
      if (this.ws !== socket) return; // Ignoruj wiadomości ze starych socketów

      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { this.emit('malformed', ev.data); return; }
      this.emit('message', msg);
      if (msg.type) this.emit(msg.type, msg);
    };

    socket.onclose = (ev) => {
      // KLUCZOWA ZMIANA: Ignoruj zamknięcie, jeśli this.ws wskazuje już na inny (nowszy) socket
      if (this.ws !== socket) return;

      this.connected = false;
      this.ws = null;
      this.emit('close', ev);

      const code = ev && ev.code;
      if (code === 4001) {
        this.emit('auth_failed', ev);
        return;
      }

      // Reconnect logic
      this.reconnectTimeout = setTimeout(() => {
        // Ponowne sprawdzenie tożsamości przed reconnectem
        if (this.ws !== null && this.ws !== socket) return; 
        
        this.emit('reconnect', { room: this.room });
        this.connect({ host: this.host, room: this.room });
      }, this.reconnectDelay);
    };

    socket.onerror = (err) => { 
        if (this.ws !== socket) return;
        this.emit('error', err); 
    };
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) { 
        this.ws.onclose = null; 
        try { this.ws.close(); } catch(e) {} 
        this.ws = null; }
    this.connected = false;
    this.emit('close', { by: 'client' });
  }

  send(obj) {
    const token = localStorage.getItem('access_token');
    if (token) obj.token = token; // dodajemy token do payload
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('send_failed', obj);
      return false;
    }
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  on(eventType, fn) {
    const arr = this.listeners.get(eventType) || [];
    arr.push(fn);
    this.listeners.set(eventType, arr);
    return () => this.off(eventType, fn);
  }

  off(eventType, fn) {
    const arr = this.listeners.get(eventType) || [];
    this.listeners.set(eventType, arr.filter(f => f !== fn));
  }

  emit(eventType, payload) {
    const arr = this.listeners.get(eventType) || [];
    arr.forEach(fn => {
      try { fn(payload); } catch (e) { console.error('WS listener error for', eventType, e); }
    });
  }
}

const wsClient = new WSClient();
export default wsClient;

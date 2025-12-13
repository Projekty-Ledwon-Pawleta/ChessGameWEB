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

    // zamknij stare połączenie jeśli jest
    if (this.ws) {
      try { this.ws.close(); } catch(e) {}
    }

    const url = this.buildUrl(this.room);

    if (!url) {
      this.emit('auth_required', { message: 'No access token found' });
      return;
    }

    // Jeśli nie ma tokena — emitujemy event i nie łączymy (możesz zmienić żeby i tak próbował)
    const access = localStorage.getItem('access_token');
    if (!access) {
      this.emit('auth_required', { message: 'No access token found' });
      return;
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.emit('open');
      // czyścisz ewentualny timer reconnect
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { this.emit('malformed', ev.data); return; }
      this.emit('message', msg);
      if (msg.type) this.emit(msg.type, msg);
    };

    this.ws.onclose = (ev) => {
      this.connected = false;
      this.ws = null;
      this.emit('close', ev);

      // jeśli zamknięcie było spowodowane brakiem autoryzacji, backend może zwrócić specyficzny code
      // np. w consumerze chcesz zamykać z code=4001 dla auth failure — wtedy nie reconnectujemy
      const code = ev && ev.code;
      if (code === 4001) {
        this.emit('auth_failed', ev);
        return;
      }

      // reconnect
      this.reconnectTimeout = setTimeout(() => {
        this.emit('reconnect', { room: this.room });
        // przy reconnect pobieramy z localStorage najnowszy token dzięki buildUrl()
        this.connect({ host: this.host, room: this.room });
      }, this.reconnectDelay);
    };

    this.ws.onerror = (err) => { this.emit('error', err); };
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) { this.ws.close(); this.ws = null; }
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

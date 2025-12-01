// src/api/wsClient.js
const defaultHost = 'ws://localhost:8000'; // jeśli chcesz, możesz podać tu swój domyślny

class WSClient {
  constructor() {
    this.ws = null;
    this.host = defaultHost;
    this.room = null;
    this.connected = false;
    this.reconnectTimeout = null;
    this.listeners = new Map(); // eventType -> [fn]
  }

  buildUrl(room) {
    return `${this.host}/ws/game/${encodeURIComponent(room)}/`;
  }

  connect({ host, room } = {}) {
    if (host) this.host = host;
    if (room) this.room = room;

    if (!this.room) throw new Error('room required to connect');
    if (this.ws) this.ws.close();

    const url = this.buildUrl(this.room);
    this.ws = new WebSocket(url);

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
      this.reconnectTimeout = setTimeout(() => {
        this.emit('reconnect');
        this.connect();
      }, 2000);
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

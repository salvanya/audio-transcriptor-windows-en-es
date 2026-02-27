// ws-client.js
class WSClient {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnects = 5;
        this.listeners = {};
    }

    connect() {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log("WebSocket connected");
            this.reconnectAttempts = 0;
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event && this.listeners[data.event]) {
                    this.listeners[data.event].forEach(cb => cb(data));
                }
            } catch (e) {
                console.error("Error parsing WS message", e);
            }
        };

        this.socket.onclose = () => {
            console.log("WebSocket disconnected");
            this.attemptReconnect();
        };

        this.socket.onerror = (err) => {
            console.error("WebSocket error", err);
            // close will be called which triggers reconnect
        };
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnects) {
            this.reconnectAttempts++;
            console.log(`Reconnecting (Attempt ${this.reconnectAttempts})...`);
            setTimeout(() => this.connect(), 2000);
        } else {
            console.error("Max reconnect attempts reached.");
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
}

// Instantiate globally
const wsHost = window.location.host; // e.g., localhost:47821
window.wsClient = new WSClient(`ws://${wsHost}/ws/progress`);

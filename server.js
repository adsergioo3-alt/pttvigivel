// npm install ws express cors
const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// roomName -> Map(ws -> {name, peerId})
const rooms = new Map();
let lastLocationUpdate = null;

function getStatus() {
    let clients = 0;
    const roomDetails = [];
    const userLocations = [];
    for (const [roomName, room] of rooms.entries()) {
        clients += room.size;
        roomDetails.push({ room: roomName, users: room.size });
        for (const userData of room.values()) {
            if (userData && typeof userData.lat === 'number' && typeof userData.lng === 'number') {
                userLocations.push({
                    name: userData.name,
                    room: roomName,
                    lat: userData.lat,
                    lng: userData.lng,
                });
            }
        }
    }
    return {
        status: 'online',
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        clients,
        roomDetails,
        userLocations,
        lastLocationUpdate,
    };
}

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PTT Service Status</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        :root {
            color-scheme: light;
            --bg: #eef1f8;
            --card: #ffffff;
            --text: #111827;
            --muted: #6b7280;
            --border: #d1d5db;
            --primary: #2563eb;
            --danger: #dc2626;
            --success: #16a34a;
            --surface: #f8fafc;
        }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: radial-gradient(circle at top, rgba(37,99,235,0.12), transparent 32%), var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; padding: 24px; }
        .container { width: min(100%, 940px); display: grid; gap: 20px; }
        .top-card, .room-card { background: var(--card); border: 1px solid var(--border); border-radius: 24px; box-shadow: 0 18px 50px rgba(15,23,42,0.08); padding: 28px; }
        .top-card header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .top-card h1 { margin: 0; font-size: clamp(1.6rem, 2vw, 2.4rem); }
        .subtitle { margin: 8px 0 0; color: var(--muted); }
        .status-pill { display: inline-flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 999px; background: rgba(22,163,74,0.12); color: var(--success); font-weight: 700; }
        .status-pill.offline { background: rgba(220,38,38,0.12); color: var(--danger); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
        .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 24px; }
        .metric { border: 1px solid var(--border); border-radius: 18px; padding: 18px; background: var(--surface); }
        .metric strong { display: block; font-size: 0.9rem; color: var(--muted); margin-bottom: 8px; }
        .metric span { font-size: 1.7rem; font-weight: 700; }
        .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
        button { border: none; border-radius: 14px; padding: 14px 20px; font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: transform 0.15s ease, background-color 0.15s ease, opacity 0.15s ease; }
        button:hover:not(:disabled) { transform: translateY(-1px); }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-danger { background: var(--danger); color: white; }
        .info-row { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; margin-top: 18px; }
        .note { color: var(--muted); font-size: 0.95rem; }
        .error { color: var(--danger); font-weight: 700; margin-top: 14px; min-height: 1.2em; }
        .room-card h2 { margin-top: 0; }
        .room-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
        .room-item { padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .room-item strong { color: var(--text); }
        .no-rooms { color: var(--muted); }
        #map { width: 100%; min-height: 420px; border-radius: 24px; border: 1px solid var(--border); }
    </style>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
    <div class="container">
        <section class="top-card">
            <header>
                <div>
                    <h1>PTT Service Status</h1>
                    <p class="subtitle">Painel rápido para monitorar o servidor WebSocket e suas salas ativas.</p>
                </div>
                <div id="statusBadge" class="status-pill"><span class="status-dot"></span><span id="status">carregando...</span></div>
            </header>
            <div class="grid">
                <div class="metric">
                    <strong>Salas</strong>
                    <span id="rooms">0</span>
                </div>
                <div class="metric">
                    <strong>Clientes conectados</strong>
                    <span id="clients">0</span>
                </div>
                <div class="metric">
                    <strong>Última atualização</strong>
                    <span id="time">--:--:--</span>
                </div>
                <div class="metric">
                    <strong>Último GPS</strong>
                    <span id="lastLocation">nenhum</span>
                </div>
                <div class="metric">
                    <strong>Próxima atualização</strong>
                    <span id="nextRefresh">--</span>
                </div>
            </div>
            <div class="actions">
                <button id="refreshBtn" class="btn-primary" onclick="refreshStatus()">Atualizar agora</button>
                <button id="clearBtn" class="btn-danger" onclick="clearRooms()">Limpar salas</button>
            </div>
            <div class="info-row">
                <p class="note">Atualiza automaticamente a cada 10 segundos. Use o botão para forçar uma atualização manual.</p>
                <p id="message" class="error" aria-live="polite"></p>
            </div>
        </section>

        <section class="room-card">
            <h2>Mapa de localização</h2>
            <div id="map"></div>
        </section>

        <section class="room-card">
            <h2>Salas ativas</h2>
            <ul id="roomList" class="room-list">
                <li class="room-item no-rooms">Nenhuma sala ativa no momento.</li>
            </ul>
        </section>
    </div>

    <script>
        const refreshBtn = document.getElementById('refreshBtn');
        const clearBtn = document.getElementById('clearBtn');
        const statusBadge = document.getElementById('statusBadge');
        const statusEl = document.getElementById('status');
        const messageEl = document.getElementById('message');
        const lastLocationEl = document.getElementById('lastLocation');
        const roomList = document.getElementById('roomList');
        const nextRefreshEl = document.getElementById('nextRefresh');
        let nextRefreshAt = Date.now() + 10000;
        let countdownTimer;
        let map;
        let markers = [];

        function initMap() {
            map = L.map('map', { zoomControl: true, attributionControl: false }).setView([-15.7801, -47.9292], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors',
            }).addTo(map);
        }

        function updateMapLocations(locations) {
            markers.forEach(marker => map.removeLayer(marker));
            markers = [];
            if (!locations || !locations.length) {
                map.setView([-15.7801, -47.9292], 4);
                return;
            }
            const bounds = [];
            locations.forEach(loc => {
                if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
                const marker = L.marker([loc.lat, loc.lng]).addTo(map);
                marker.bindPopup('<strong>' + loc.name + '</strong><br>' + loc.room);
                markers.push(marker);
                bounds.push([loc.lat, loc.lng]);
            });
            if (bounds.length) {
                map.fitBounds(bounds, { maxZoom: 12, padding: [24, 24] });
            }
        }

        function setLoading(isLoading) {
            refreshBtn.disabled = isLoading;
            clearBtn.disabled = isLoading;
        }

        function updateCountdown() {
            const seconds = Math.max(0, Math.round((nextRefreshAt - Date.now()) / 1000));
            nextRefreshEl.textContent = seconds === 0 ? 'agora' : seconds + 's';
        }

        function renderRooms(roomDetails) {
            roomList.innerHTML = '';
            if (!roomDetails.length) {
                roomList.innerHTML = '<li class="room-item no-rooms">Nenhuma sala ativa no momento.</li>';
                return;
            }
            roomDetails.forEach(({ room, users }) => {
                const li = document.createElement('li');
                li.className = 'room-item';
                li.innerHTML = '<strong>' + room + '</strong><span>' + users + ' usuário(s)</span>';
                roomList.appendChild(li);
            });
        }

        async function refreshStatus() {
            setLoading(true);
            messageEl.textContent = '';
            try {
                const response = await fetch('/status');
                if (!response.ok) throw new Error('Não foi possível obter o status.');
                const data = await response.json();

                statusEl.textContent = data.status;
                statusBadge.className = 'status-pill' + (data.status !== 'online' ? ' offline' : '');
                document.getElementById('rooms').textContent = data.rooms;
                document.getElementById('clients').textContent = data.clients;
                document.getElementById('time').textContent = new Date(data.timestamp).toLocaleTimeString();
                lastLocationEl.textContent = data.lastLocationUpdate ? data.lastLocationUpdate.message : 'nenhum';
                renderRooms(data.roomDetails);
                updateMapLocations(data.userLocations);
                nextRefreshAt = Date.now() + 10000;
                updateCountdown();
            } catch (error) {
                statusEl.textContent = 'offline';
                statusBadge.className = 'status-pill offline';
                document.getElementById('rooms').textContent = '-';
                document.getElementById('clients').textContent = '-';
                document.getElementById('time').textContent = '--';
                roomList.innerHTML = '<li class="room-item no-rooms">Falha ao carregar dados.</li>';
                messageEl.textContent = error.message;
            } finally {
                setLoading(false);
            }
        }

        async function clearRooms() {
            if (!confirm('Tem certeza que deseja limpar todas as salas?')) return;
            setLoading(true);
            messageEl.textContent = '';
            try {
                const response = await fetch('/clear-rooms', { method: 'POST' });
                if (!response.ok) throw new Error('Erro ao limpar salas.');
                await refreshStatus();
            } catch (error) {
                messageEl.textContent = error.message;
            } finally {
                setLoading(false);
            }
        }

        initMap();
        refreshStatus();
        countdownTimer = setInterval(updateCountdown, 250);
        setInterval(refreshStatus, 10000);
    </script>
</body>
</html>`);
});

app.get('/map', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Mapa - PTT</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>html,body,#map{height:100%;margin:0;padding:0}body{font-family:Inter,system-ui,Arial,sans-serif}</style>
</head>
<body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const map = L.map('map', { zoomControl: true, attributionControl: false }).setView([-15.7801, -47.9292], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        let markers = [];

        function updateMarkers(locations) {
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            if (!locations || !locations.length) return;
            const bounds = [];
            locations.forEach(loc => {
                if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
                const m = L.marker([loc.lat, loc.lng]).addTo(map);
                m.bindPopup('<strong>' + (loc.name || 'sem nome') + '</strong><br>' + (loc.room || ''));
                markers.push(m);
                bounds.push([loc.lat, loc.lng]);
            });
            if (bounds.length) map.fitBounds(bounds, { maxZoom: 12, padding: [24, 24] });
        }

        async function refresh() {
            try {
                const res = await fetch('/status');
                if (!res.ok) throw new Error('Falha ao obter status');
                const data = await res.json();
                updateMarkers(data.userLocations);
            } catch (e) {
                console.error(e);
            }
        }

        refresh();
        setInterval(refresh, 5000);
    </script>
</body>
</html>`);
});

app.get('/status', (req, res) => {
    res.json(getStatus());
});

app.post('/clear-rooms', (req, res) => {
    clearAllRooms();
    res.json({ status: 'rooms_cleared' });
});

wss.on('connection', (ws) => {
    console.log('Dispositivo conectado');

    ws.on('message', (message) => {
        try {
            // CONVERSÃO VITAL: Transforma o Buffer recebido em String de texto
            const msgText = message.toString();

            // Agora sim tentamos o JSON.parse
            const data = JSON.parse(msgText);
            console.log('[WS] mensagem recebida:', data.type || 'sem tipo', msgText);

            if (data.type === 'register') {
                const { room, name, peerId } = data;
                ws.room = room;
                ws.userData = { name, peerId, isTalking: false };

                if (!rooms.has(room)) rooms.set(room, new Map());
                const roomMap = rooms.get(room);

                // Prevenção de logins duplicados: se já existir um cliente
                // com o mesmo `peerId` (preferido) ou `name`, encerramos a
                // conexão antiga e substituímos pela nova.
                let existingClient = null;
                for (const [client, udata] of roomMap.entries()) {
                    if (!udata) continue;
                    if ((peerId && udata.peerId === peerId) || (!peerId && udata.name === name)) {
                        existingClient = client;
                        break;
                    }
                }

                if (existingClient) {
                    try {
                        existingClient.send(JSON.stringify({ type: 'duplicate_login', reason: 'replaced_by_new_connection' }));
                        existingClient.close(4000, 'replaced_by_new_connection');
                    } catch (e) {
                        // ignora erros ao fechar a conexão antiga
                    }
                    roomMap.delete(existingClient);
                }

                roomMap.set(ws, ws.userData);

                console.log(`[Registro] ${name} entrou na sala ${room}`);
                broadcastPresence(room);
            }

            // Repasse de áudio
            if (data.type === 'audio') {
                if (ws.room) {
                    // Repassa exatamente a mesma string para os outros
                    broadcastToRoom(ws.room, msgText, ws);
                }
            }

            // Repasse de imagens
            if (data.type === 'image') {
                if (ws.room) {
                    console.log(`[Imagem] Recebida de: ${data.name} na sala ${ws.room}`);
                    // Repassa exatamente a mesma string para os outros usuários na sala
                    broadcastToRoom(ws.room, msgText, ws);
                }
            }

            if (data.type === 'location_update') {
                if (ws.userData) {
                    const lat = Number(data.lat);
                    const lng = Number(data.lng);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) {
                        ws.userData.lat = lat;
                        ws.userData.lng = lng;
                        const logMessage = `[Localização] ${ws.userData.name} está em: ${lat}, ${lng} na sala ${ws.room || 'sem sala'}`;
                        console.log(logMessage);
                        lastLocationUpdate = {
                            timestamp: new Date().toISOString(),
                            name: ws.userData.name,
                            room: ws.room,
                            lat,
                            lng,
                            message: logMessage,
                        };
                    } else {
                        console.warn('[Localização] coordenadas inválidas recebidas:', data.lat, data.lng);
                    }
                } else {
                    console.warn('[Localização] recebido sem ws.userData', data);
                }
            }

            if (data.type === 'talking_state') {
                if (ws.room && ws.userData) {
                    ws.userData.isTalking = data.isTalking;
                    broadcastPresence(ws.room);
                }
            }
        } catch (e) { 
            console.error('Erro ao processar mensagem:', e.message); 
        }
    });

    ws.on('close', () => {
        if (ws.room && rooms.has(ws.room)) {
            rooms.get(ws.room).delete(ws);
            broadcastPresence(ws.room);
        }
    });
});

function broadcastPresence(roomName) {
    const room = rooms.get(roomName);
    if (!room) return;
    const users = Array.from(room.values());
    const msg = JSON.stringify({ type: 'presence', users });
    room.forEach((_, client) => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

function broadcastTalkingState(roomName, senderWs) {
    const room = rooms.get(roomName);
    if (!room) return;
    const sender = room.get(senderWs) || senderWs.userData || {};
    const msg = JSON.stringify({ type: 'user_talking', name: sender.name, isTalking: sender.isTalking });
    room.forEach((userData, client) => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

function broadcastToRoom(roomName, msgText, senderWs) {
    const room = rooms.get(roomName);
    if (!room) return;
    room.forEach((userData, client) => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) client.send(msgText);
    });
}

function clearAllRooms() {
    for (const [roomName, room] of rooms.entries()) {
        room.forEach((userData, client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'room_cleared', room: roomName }));
            }
            client.room = undefined;
            client.userData = undefined;
        });
        rooms.delete(roomName);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor PTT rodando na porta ${PORT}`));

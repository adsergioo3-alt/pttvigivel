// npm install ws express cors
const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// roomName -> Map(ws -> {name, peerId})
const rooms = new Map();

function getStatus() {
    let clients = 0;
    for (const room of rooms.values()) {
        clients += room.size;
    }
    return {
        status: 'online',
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        clients,
    };
}

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PTT Service Status</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f2f2f7; color: #1a1a1a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: white; border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,0.08); padding: 24px; width: min(520px, 90vw); }
        h1 { margin: 0 0 12px; font-size: 1.8rem; }
        p { margin: 8px 0; line-height: 1.5; }
        .status { font-weight: 700; color: #107c10; }
        .offline { color: #a4262c; }
        .stats { margin-top: 14px; padding: 16px; background: #f8f8ff; border-radius: 10px; }
        button { margin-top: 16px; padding: 10px 18px; border:none; border-radius: 8px; background:#0078d4; color:white; cursor:pointer; }
        button:hover { background:#005a9e; }
    </style>
</head>
<body>
    <div class="card">
        <h1>PTT Service Status</h1>
        <p>Use este painel para verificar se o serviço está online.</p>
        <p>Último estado: <span id="status" class="status">carregando...</span></p>
        <div class="stats">
            <p><strong>Sala(s):</strong> <span id="rooms">0</span></p>
            <p><strong>Cliente(s) conectados:</strong> <span id="clients">0</span></p>
            <p><strong>Hora:</strong> <span id="time">--</span></p>
        </div>
        <button onclick="refreshStatus()">Atualizar</button>
    </div>
    <script>
        async function refreshStatus() {
            try {
                const response = await fetch('/status');
                if (!response.ok) throw new Error('Erro na requisição');
                const data = await response.json();
                document.getElementById('status').textContent = data.status;
                document.getElementById('status').className = data.status === 'online' ? 'status' : 'offline';
                document.getElementById('rooms').textContent = data.rooms;
                document.getElementById('clients').textContent = data.clients;
                document.getElementById('time').textContent = new Date(data.timestamp).toLocaleString();
            } catch (error) {
                document.getElementById('status').textContent = 'offline';
                document.getElementById('status').className = 'offline';
                document.getElementById('rooms').textContent = '-';
                document.getElementById('clients').textContent = '-';
                document.getElementById('time').textContent = '--';
            }
        }
        refreshStatus();
        setInterval(refreshStatus, 10000);
    </script>
</body>
</html>`);
});

app.get('/status', (req, res) => {
    res.json(getStatus());
});

wss.on('connection', (ws) => {
    console.log('Dispositivo conectado');

    ws.on('message', (message) => {
        try {
            // CONVERSÃO VITAL: Transforma o Buffer recebido em String de texto
            const msgText = message.toString();

            // Agora sim tentamos o JSON.parse
            const data = JSON.parse(msgText);

            if (data.type === 'register') {
                const { room, name, peerId } = data;
                ws.room = room;
                ws.userData = { name, peerId, isTalking: false };

                if (!rooms.has(room)) rooms.set(room, new Map());
                rooms.get(room).set(ws, ws.userData);

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

server.listen(3000, () => console.log('Servidor PTT rodando na porta 3000'));

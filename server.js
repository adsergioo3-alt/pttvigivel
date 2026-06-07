// npm install ws express cors
const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// roomName -> Map(ws -> {name, peerId})
const rooms = new Map();

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

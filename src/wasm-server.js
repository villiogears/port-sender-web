const fs = require('fs');
const { WebSocketServer } = require('ws');
require('./public/wasm_exec.js'); // ルートから実行する場合

const go = new Go();
const wasmBuffer = fs.readFileSync('./server/main.wasm');

let wasmInstance;
WebAssembly.instantiate(wasmBuffer, go.importObject).then((result) => {
    wasmInstance = result.instance;
    go.run(wasmInstance);
    console.log("Signaling WASM Engine started.");
    startWSServer();
});

function startWSServer() {
    const wss = new WebSocketServer({ port: 8080 });
    const clients = new Map(); // id -> ws

    wss.on('connection', (ws) => {
        const id = Math.random().toString(36).substring(2, 15);
        clients.set(id, ws);

        ws.on('message', (data) => {
            try {
                // Go WASMのロジックを呼び出し
                const responseJson = global.processSignaling(data.toString(), id);
                
                if (responseJson) {
                    const { targetId, payload } = JSON.parse(responseJson);
                    const targetWs = clients.get(targetId);
                    if (targetWs && targetWs.readyState === 1) {
                        targetWs.send(JSON.stringify(payload));
                    }
                }
            } catch (err) {
                console.error("WASM processing error:", err);
            }
        });

        ws.on('close', () => clients.delete(id));
    });

    console.log("WebSocket server listening on ws://localhost:8080");
}
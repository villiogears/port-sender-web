import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';

// ESM環境で__dirnameを再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// シグナリングサーバーをVite内で実行するプラグイン
const wasmSignalingPlugin = (): Plugin => ({
  name: 'wasm-signaling-server',
  configureServer(server: ViteDevServer) {
    // .wasm ファイルの MIME タイプを強制するミドルウェア
    server.middlewares.use((req, res, next) => {
      if (req.url?.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }
      next();
    });

    // 1. Go WASM実行環境のロード
    const wasmExecPath = path.resolve(__dirname, 'public/wasm_exec.js');
    const wasmExecCode = fs.readFileSync(wasmExecPath, 'utf-8');
    
    // globalにGoクラスを定義（Node.js環境用）
    const fn = new Function('global', 'globalThis', wasmExecCode);
    fn(global, global);

    // @ts-ignore: Go runtime is injected via Function evaluation
    const go = new global.Go();
    const wasmBuffer = fs.readFileSync(path.resolve(__dirname, 'server/main.wasm'));

    // 2. WASMの初期化とシグナリングサーバーの起動
    WebAssembly.instantiate(wasmBuffer, go.importObject).then((result) => {
      go.run(result.instance);
      console.log("\x1b[32m%s\x1b[0m", "✓ Signaling WASM Engine started inside Vite process.");

      // 自宅サーバーの全てのインターフェースで待機
      const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });
      const clients = new Map<string, any>();

      wss.on('connection', (ws) => {
        const id = Math.random().toString(36).substring(2, 15);
        clients.set(id, ws);

        ws.on('message', (data) => {
          try {
            // Go WASM内のロジックを呼び出し
            // @ts-ignore: global.processSignaling is defined by Go main()
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
    });
  }
});

export default defineConfig({
  plugins: [svelte(), wasmSignalingPlugin()],
  server: {
    allowedHosts: ['portfwd.elphadeal.f5.si']
  }
});
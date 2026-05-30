interface Env {}

// 接続中のクライアントをメモリに保持（※Workerのインスタンスごとに分離されます）
const clients = new Map<string, WebSocket>();
const peers = new Map<string, WebSocket>();

export const onRequest: PagesFunction<Env> = async (context) => {
  const upgradeHeader = context.request.headers.get('upgrade')?.toLowerCase();
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const [client, server] = new WebSocketPair();

  server.accept();
  
  let currentKey: string | null = null;
  let isHost = false;
  const colo = context.request.cf?.colo || 'unknown'; // 接続されているデータセンターID

  server.addEventListener('message', (event) => {
    try {
      if (typeof event.data !== 'string') return;
      const msg = JSON.parse(event.data);
      const { type, key } = msg;
      if (key) currentKey = key;

      console.log(`[Colo:${colo}] type: ${type}, key: ${key}, isHost: ${isHost}`);

      switch (type) {
        case 'host':
          isHost = true;
          clients.set(key, server);
          console.log(`[Worker] Registered Host for key: ${key}`);
          break;

        case 'join':
          isHost = false;
          const host = clients.get(key);
          if (host) {
            peers.set(key, server);
            host.send(JSON.stringify(msg));
            console.log(`[Worker] Forwarded JOIN to Host for key: ${key}`);
          } else {
            console.log(`[Worker] Host not found for key: ${key}`);
          }
          break;

        case 'signal':
          const target = isHost ? peers.get(key) : clients.get(key);
          console.log(`[Worker] Routing SIGNAL from ${isHost ? 'Host' : 'Peer'} to target: ${!!target}`);
          if (target) {
            target.send(JSON.stringify(msg));
          }
          break;
      }
    } catch (e) {
      console.error('[Worker Error]:', e);
    }
  });

  // 接続が切れた時のクリーンアップ
  server.addEventListener('close', () => {
    if (currentKey) {
      console.log(`[Worker] Closing connection for key: ${currentKey}`);
      if (isHost) {
        clients.delete(currentKey);
      } else {
        peers.delete(currentKey);
      }
    }
  });

  return new Response(null, { status: 101, webSocket: client });
};
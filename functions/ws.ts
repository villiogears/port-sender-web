interface Env {}

// 接続中のクライアントをメモリに保持（※Workerのインスタンスごとに分離されます）
const clients = new Map<string, WebSocket>();
const peers = new Map<string, WebSocket>();

export const onRequest: PagesFunction<Env> = async (context) => {
  const upgradeHeader = context.request.headers.get('upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const [client, server] = new WebSocketPair();

  server.accept();
  
  let currentKey: string | null = null;
  let isHost = false;

  server.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      const { type, key } = msg;
      currentKey = key;

      switch (type) {
        case 'host':
          isHost = true;
          clients.set(key, server);
          break;

        case 'join':
          isHost = false;
          const host = clients.get(key);
          if (host) {
            peers.set(key, server);
            host.send(JSON.stringify(msg)); // AさんにBさんが来たことを通知
          }
          break;

        case 'signal':
          const target = isHost ? peers.get(key) : clients.get(key);
            
          if (target) {
            target.send(JSON.stringify(msg));
          }
          break;
      }
    } catch (e) {
      console.error('WS Worker Error:', e);
    }
  });

  // 接続が切れた時のクリーンアップ
  server.addEventListener('close', () => {
    if (currentKey) {
      if (isHost) {
        clients.delete(currentKey);
      } else {
        peers.delete(currentKey);
      }
    }
  });

  return new Response(null, { status: 101, webSocket: client });
};
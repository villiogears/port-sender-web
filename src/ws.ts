interface Env {}

// 接続中のクライアントをメモリに保持（※Workerのインスタンスごとに分離されます）
const clients = new Map<string, WebSocket>();
const peers = new Map<string, WebSocket>();

export const onRequest: PagesFunction<Env> = async (context) => {
  const upgradeHeader = context.request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const [client, server] = new WebSocketPair();

  server.accept();
  
  server.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data as string);

      switch (msg.type) {
        case 'host':
          // Aさんをキーに紐づけて保存
          clients.set(msg.key, server);
          break;

        case 'join':
          // Bさんが来たらAさんを探す
          const host = clients.get(msg.key);
          if (host) {
            peers.set(msg.key, server); // Bさんの接続も保存
            host.send(JSON.stringify(msg)); // AさんにBさんが来たことを通知
          }
          break;

        case 'signal':
          // シグナリング（データの転送）
          const target = (server === clients.get(msg.key)) 
            ? peers.get(msg.key) 
            : clients.get(msg.key);
            
          if (target) {
            target.send(JSON.stringify(msg));
          }
          break;
      }
    } catch (e) {
      console.error(e);
    }
  });

  return new Response(null, { status: 101, webSocket: client });
};
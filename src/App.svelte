<script>
  import { onMount } from 'svelte';

  let portInput = '';
  let generatedKey = '';
  let joinKey = '';
  let receivedPort = '';
  let socket;
  let isWasmLoaded = false;

  onMount(async () => {
    // Go WASM ランタイム (wasm_exec.js) が読み込まれていない場合は動的に追加
    if (typeof window.Go === 'undefined') {
      const script = document.createElement('script');
      script.src = '/wasm_exec.js'; // public ディレクトリから配信される想定
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load /wasm_exec.js'));
        document.head.appendChild(script);
      });
    }

    // Go WASMの初期化
    const go = new Go();
    const response = await fetch("/main.wasm");
    if (!response.ok) {
      console.error("WASMのロードに失敗しました。ファイルが public/main.wasm に存在するか確認してください。");
      return;
    }
    
    const result = await WebAssembly.instantiateStreaming(response, go.importObject);
    go.run(result.instance);
    isWasmLoaded = true;

    // WebSocket接続
    socket = new WebSocket("ws://localhost:8080/ws");
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // シグナリングサーバーからの転送処理
      if (data.type === 'join') {
        // Bさんが来たのでAさんがポートを送る
        const message = window.formatPortMessage(portInput);
        socket.send(JSON.stringify({ type: 'signal', key: data.key, data: message }));
      } else if (data.type === 'signal') {
        // BさんがAさんからのデータを受け取る
        // WASM側で付与された接頭辞を除去してポート番号のみを抽出
        receivedPort = data.data.replace('SHARED_PORT:', '');
      }
    };
  });

  // Aさんの処理: ポートを登録してキーを発行
  function handleHost() {
    if (!portInput) return alert("ポート番号を入力してください");
    // Go WASM関数を呼び出し
    generatedKey = window.generateWasmKey();
    
    socket.send(JSON.stringify({
      type: 'host',
      key: generatedKey
    }));
  }

  // Bさんの処理: キーを使ってポートを取得
  function handleJoin() {
    if (!joinKey) return alert("キーを入力してください");
    socket.send(JSON.stringify({
      type: 'join',
      key: joinKey
    }));
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert("コピーしました！");
  }
</script>

<main style="padding: 2rem; font-family: sans-serif;">
  <div class="app-container">
    <h1>Port Connector</h1>
    <p class="subtitle">WASM & WebSocket Powered Sharing</p>

    {#if !isWasmLoaded}
      <div class="loader">
        <div class="spinner"></div>
        <p>WASMエンジンを起動中...</p>
      </div>
    {:else}
      <div class="card">
        <!-- 共有セクション (Person A) -->
        <div class="section">
          <h3><span class="icon">📤</span> ポートを共有する</h3>
          <div class="input-group">
            <input type="number" bind:value={portInput} placeholder="ポート番号 (例: 8080)" />
            <button class="host-btn" on:click={handleHost} disabled={!portInput}>キーを発行</button>
          </div>

          {#if generatedKey}
            <div class="result-area">
              <label>相手にこのキーを伝えてください:</label>
              <div class="copy-wrapper">
                <code>{generatedKey}</code>
                <button class="icon-btn" on:click={() => copyToClipboard(generatedKey)} title="コピー">📋</button>
              </div>
            </div>
          {/if}
        </div>

        <div class="divider">
          <span>OR</span>
        </div>

        <!-- 受信セクション (Person B) -->
        <div class="section">
          <h3><span class="icon">📥</span> ポートを受け取る</h3>
          <div class="input-group">
            <input type="text" bind:value={joinKey} placeholder="32文字のキーを入力" />
            <button class="join-btn" on:click={handleJoin} disabled={!joinKey}>接続</button>
          </div>

          {#if receivedPort}
            <div class="result-area received">
              <label>受信したポート番号:</label>
              <div class="data-display">
                <code>{receivedPort}</code>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</main>

<style>
  :global(body) { background-color: #f5f5f7; margin: 0; }
  .app-container { max-width: 500px; margin: 2rem auto; text-align: center; }
  h1 { margin-bottom: 0.2rem; color: #1d1d1f; }
  .subtitle { color: #86868b; margin-top: 0; margin-bottom: 2rem; font-size: 0.9rem; }
  .card {
    background: #ffffff;
    border-radius: 20px;
    padding: 2rem;
    box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    border: 1px solid #e5e5e7;
  }
  .section { text-align: left; }
  h3 { font-size: 1rem; margin-bottom: 1rem; color: #1d1d1f; display: flex; align-items: center; gap: 0.5rem; }
  .input-group { display: flex; gap: 0.5rem; }
  input {
    flex: 1;
    padding: 0.7rem;
    border-radius: 10px;
    border: 1px solid #d2d2d7;
    font-size: 1rem;
    outline-color: #0071e3;
  }
  button { cursor: pointer; border: none; border-radius: 10px; font-weight: 600; transition: all 0.2s; }
  button:disabled { opacity: 0.3; cursor: not-allowed; }
  .host-btn { background: #0071e3; color: white; padding: 0 1.2rem; }
  .join-btn { background: #1d1d1f; color: white; padding: 0 1.2rem; }
  .icon-btn { background: #e5e5e7; font-size: 1.1rem; padding: 0.5rem 0.8rem; }
  .divider { height: 1px; background: #e5e5e7; margin: 2.5rem 0; position: relative; }
  .divider span { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 0 1rem; font-size: 0.75rem; color: #86868b; font-weight: bold; }
  .result-area { margin-top: 1rem; padding: 1rem; background: #f5f5f7; border-radius: 12px; }
  .result-area label { font-size: 0.75rem; color: #86868b; margin-bottom: 0.5rem; display: block; }
  .copy-wrapper { display: flex; align-items: center; gap: 0.5rem; }
  code {
    flex: 1;
    word-break: break-all;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.9rem;
    color: #1d1d1f;
    background: #e5e5e7;
    padding: 0.4rem;
    border-radius: 6px;
  }
  .received code { color: #0071e3; background: transparent; padding: 0; font-size: 1.2rem; }
  .loader { margin-top: 4rem; }
  .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #0071e3; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
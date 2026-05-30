# Stage 1: Go WASM のビルド
FROM golang:1.24-bookworm AS go-builder

WORKDIR /app
COPY . .

# フロントエンド用とサーバー用の WASM をビルド
RUN GOOS=js GOARCH=wasm go build -o public/main.wasm src/main.go
RUN GOOS=js GOARCH=wasm go build -o server/main.wasm server/main.go

# Go ランタイム JS をコピー
RUN cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" ./public/

# Stage 2: Node.js 実行環境
FROM node:22-bookworm

WORKDIR /app

# ビルド済みのファイルとソースをコピー
COPY --from=go-builder /app /app

# 依存関係のインストール
RUN npm install

# Vite (5173) と シグナリングサーバー (8080) のポートを開放
EXPOSE 5173 8080

# Vite をホストモードで起動（外部からのアクセスを許可）
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
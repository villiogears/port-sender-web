package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// キーとポート番号のペアを保持するメモリキャッシュ
var (
	store = make(map[string]string)
	mu    sync.Mutex
)

type Message struct {
	Type string `json:"type"` // "host" or "join"
	Key  string `json:"key"`
	Port string `json:"port,omitempty"`
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer ws.Close()

	for {
		var msg Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			break
		}

		switch msg.Type {
		case "host":
			// Aさんからの登録
			mu.Lock()
			store[msg.Key] = msg.Port
			mu.Unlock()
			log.Printf("Registered: Key=%s, Port=%s", msg.Key, msg.Port)

		case "join":
			// Bさんからの照会
			mu.Lock()
			port, ok := store[msg.Key]
			mu.Unlock()

			response := Message{Type: "result", Key: msg.Key}
			if ok {
				response.Port = port
				log.Printf("Matched: Key=%s -> Port=%s", msg.Key, port)
			} else {
				response.Port = "NOT_FOUND"
			}
			ws.WriteJSON(response)
		}
	}
}

func main() {
	http.HandleFunc("/ws", handleConnections)

	// 静的ファイル（WASMやSvelteビルド済みファイル）の配信も行う場合
	// http.Handle("/", http.FileServer(http.Dir("./dist")))

	log.Println("Server started on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

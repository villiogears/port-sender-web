package main

import (
	"encoding/json"
	"sync"
	"syscall/js"
)

// キーと接続ID（Node.js側で管理するID）の紐付け
var (
	clients = make(map[string]string) // Key -> ClientID
	mu      sync.Mutex
)

type Message struct {
	Type string `json:"type"`
	Key  string `json:"key"`
	Data string `json:"data,omitempty"`
	From string `json:"from,omitempty"` // Node.js側から付与されるID
}

type Response struct {
	TargetID string  `json:"targetId"`
	Payload  Message `json:"payload"`
}

// Node.jsからメッセージが届くたびに呼び出される関数
func handleMessage(this js.Value, args []js.Value) interface{} {
	var msg Message
	json.Unmarshal([]byte(args[0].String()), &msg)
	clientID := args[1].String()
	msg.From = clientID

	mu.Lock()
	defer mu.Unlock()

	switch msg.Type {
	case "host":
		clients[msg.Key] = clientID
		return nil

	case "join":
		// Bさんが来たことをAさんに伝える
		if hostID, ok := clients[msg.Key]; ok {
			clients[msg.Key+"_peer"] = clientID // BさんのIDを保存
			res, _ := json.Marshal(Response{
				TargetID: hostID,
				Payload:  msg,
			})
			return string(res)
		}

	case "signal":
		// AさんからのデータをBさんに、またはその逆
		// 送信元がホストならピアへ、ピアならホストへ転送
		var targetID string
		if clientID == clients[msg.Key] {
			targetID = clients[msg.Key+"_peer"]
		} else {
			targetID = clients[msg.Key]
		}

		if targetID != "" {
			res, _ := json.Marshal(Response{
				TargetID: targetID,
				Payload:  msg,
			})
			return string(res)
		}
	}
	return nil
}

func main() {
	js.Global().Set("processSignaling", js.FuncOf(handleMessage))
	select {} // プログラムを終了させない
}

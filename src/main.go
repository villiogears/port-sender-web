package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"syscall/js"
)

// 32文字のランダムな文字列を生成
func generateRandomKey(this js.Value, args []js.Value) interface{} {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}

// メッセージの整形
func formatPortMessage(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return ""
	}
	return fmt.Sprintf("SHARED_PORT:%s", args[0].String())
}

func main() {
	js.Global().Set("generateWasmKey", js.FuncOf(generateRandomKey))
	js.Global().Set("formatPortMessage", js.FuncOf(formatPortMessage))
	select {}
}

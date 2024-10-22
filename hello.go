package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "sync"
)

type Item struct {
    ID    string `json:"id"`
    Name  string `json:"name"`
}

var (
    items  = make(map[string]Item)
    mu     sync.Mutex
)

func main() {
    http.HandleFunc("/items", itemsHandler)
    http.HandleFunc("/items/", itemHandler) // for specific item
    fmt.Println("Server is running on :8080")
    http.ListenAndServe(":8080", nil)
}

func itemsHandler(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
        mu.Lock()
        defer mu.Unlock()
        var itemList []Item
        for _, item := range items {
            itemList = append(itemList, item)
        }
        json.NewEncoder(w).Encode(itemList)
    case http.MethodPost:
        var newItem Item
        if err := json.NewDecoder(r.Body).Decode(&newItem); err != nil {
            http.Error(w, err.Error(), http.StatusBadRequest)
            return
        }
        mu.Lock()
        items[newItem.ID] = newItem
        mu.Unlock()
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(newItem)
    default:
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

func itemHandler(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Path[len("/items/"):]
    mu.Lock()
    defer mu.Unlock()
    item, exists := items[id]

    switch r.Method {
    case http.MethodGet:
        if !exists {
            http.Error(w, "Item not found", http.StatusNotFound)
            return
        }
        json.NewEncoder(w).Encode(item)
    case http.MethodPut:
        var updatedItem Item
        if err := json.NewDecoder(r.Body).Decode(&updatedItem); err != nil {
            http.Error(w, err.Error(), http.StatusBadRequest)
            return
        }
        updatedItem.ID = id
        items[id] = updatedItem
        json.NewEncoder(w).Encode(updatedItem)
    case http.MethodDelete:
        if !exists {
            http.Error(w, "Item not found", http.StatusNotFound)
            return
        }
        delete(items, id)
        w.WriteHeader(http.StatusNoContent)
    default:
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

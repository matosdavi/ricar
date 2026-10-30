# Atalhos. Precisa de Go 1.24+ e Docker (para o banco local).
-include .env
export

.PHONY: deps banco rodar testar build

deps:     ## baixa as dependências e completa o go.sum
	go mod tidy

banco:    ## sobe o PostgreSQL local
	docker compose up -d db

rodar:    ## roda o servidor em http://localhost:8080 (lê o .env)
	go run ./cmd/server

testar:
	go vet ./... && go test ./...

build:
	go build -o bin/server ./cmd/server

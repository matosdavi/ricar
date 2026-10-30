// Comando server: sobe a API e o site da RiCar.
//
// Conceito Go: tudo em cmd/ vira um executável; o código reaproveitável fica
// em internal/, que o Go impede outros projetos de importar.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/matosdavi/ricar/internal/banco"
	"github.com/matosdavi/ricar/internal/config"
	"github.com/matosdavi/ricar/internal/pedidos"
	"github.com/matosdavi/ricar/internal/servidor"
)

func main() {
	if err := rodar(); err != nil {
		slog.Error("servidor parou", "erro", err)
		os.Exit(1)
	}
}

func rodar() error {
	cfg, err := config.Carregar()
	if err != nil {
		return err
	}

	// ctx é cancelado quando chega Ctrl+C ou o sinal de desligar do servidor.
	ctx, parar := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer parar()

	pool, err := banco.Conectar(ctx, cfg.BancoURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := banco.Migrar(ctx, pool); err != nil {
		return err
	}

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	handler := pedidos.NovoHandler(pedidos.NovoRepoPG(pool))
	srv := &http.Server{
		Addr:              ":" + cfg.Porta,
		Handler:           servidor.Novo(cfg, handler),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// O servidor roda numa goroutine; a principal espera o sinal de desligar.
	erroSrv := make(chan error, 1)
	go func() {
		slog.Info("servidor no ar", "porta", cfg.Porta)
		erroSrv <- srv.ListenAndServe()
	}()

	select {
	case err := <-erroSrv:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("desligando…")
	}

	// Dá até 10 s para terminar as requisições em andamento.
	desligar, cancelar := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelar()
	return srv.Shutdown(desligar)
}

// Package servidor monta o roteador: API pública, login e API do painel, telas do painel e o site.
package servidor

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/matosdavi/ricar/internal/config"
	"github.com/matosdavi/ricar/internal/pedidos"
	"github.com/matosdavi/ricar/internal/sessao"
)

// ping confere o banco; o site chama /api/saude ao abrir para "acordar" o servidor e o banco
// (no plano grátis os dois dormem), assim o pedido é registrado rápido na hora do envio.
func Novo(cfg config.Config, ped *pedidos.Handler, ping func(context.Context) error) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), cors(cfg.Origens))
	ses := sessao.Nova(cfg.PainelUsuario, cfg.PainelSenha, cfg.SessaoSegredo)

	api := r.Group("/api")
	api.GET("/saude", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		if err := ping(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "banco": false})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "banco": true})
	})
	api.POST("/pedidos", limitePorIP(10, time.Hour), ped.Criar)

	// Login do painel: no máximo 10 tentativas a cada 15 minutos por IP.
	api.POST("/sessao", limitePorIP(10, 15*time.Minute), ses.Entrar)
	api.DELETE("/sessao", ses.Sair)

	// Painel: tudo aqui exige estar logado.
	painel := api.Group("/painel", ses.Exigir)
	painel.GET("/sessao", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	painel.GET("/pedidos", ped.Listar)
	painel.POST("/pedidos", ped.CriarPainel)
	painel.GET("/pedidos/:numero", ped.Buscar)
	painel.PATCH("/pedidos/:numero", ped.Atualizar)
	painel.PATCH("/pedidos/:numero/status", ped.MudarStatus)

	// Telas do painel (só no servidor Go, nunca no GitHub Pages).
	r.GET("/painel", func(c *gin.Context) { c.Redirect(http.StatusMovedPermanently, "/painel/") })
	r.StaticFS("/painel/", http.Dir(cfg.PastaPainel))

	// O mesmo site do GitHub Pages, servido pelo Go.
	r.NoRoute(gin.WrapH(http.FileServer(http.Dir(cfg.PastaWeb))))
	return r
}

// cors deixa o site no GitHub Pages chamar a API hospedada em outro endereço.
func cors(origens []string) gin.HandlerFunc {
	permitida := map[string]bool{}
	for _, o := range origens {
		permitida[o] = true
	}
	return func(c *gin.Context) {
		if o := c.GetHeader("Origin"); permitida[o] {
			c.Header("Access-Control-Allow-Origin", o)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// limitePorIP barra quem manda pedidos demais (robôs). Janela fixa, em memória.
//
// Conceito Go: o map é compartilhado entre requisições que rodam ao mesmo
// tempo (goroutines), então o sync.Mutex garante que só uma mexe nele por vez.
func limitePorIP(max int, janela time.Duration) gin.HandlerFunc {
	type cont struct {
		n      int
		inicio time.Time
	}
	var mu sync.Mutex
	visitas := map[string]*cont{}

	return func(c *gin.Context) {
		ip, agora := c.ClientIP(), time.Now()
		mu.Lock()
		v, ok := visitas[ip]
		if !ok || agora.Sub(v.inicio) > janela {
			v = &cont{inicio: agora}
			visitas[ip] = v
		}
		v.n++
		excedeu := v.n > max
		if len(visitas) > 10000 { // limpeza simples para o mapa não crescer para sempre
			for k, x := range visitas {
				if agora.Sub(x.inicio) > janela {
					delete(visitas, k)
				}
			}
		}
		mu.Unlock()

		if excedeu {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"erro": "Muitos pedidos seguidos. Tente de novo mais tarde ou chame no WhatsApp."})
			return
		}
		c.Next()
	}
}

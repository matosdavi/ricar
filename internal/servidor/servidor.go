// Package servidor monta o roteador: API pública, API do painel (com senha) e o site.
package servidor

import (
	"crypto/subtle"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/matosdavi/ricar/internal/config"
	"github.com/matosdavi/ricar/internal/pedidos"
)

func Novo(cfg config.Config, ped *pedidos.Handler) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), cors(cfg.Origens))

	api := r.Group("/api")
	api.GET("/saude", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	api.POST("/pedidos", limitePorIP(10, time.Hour), ped.Criar)

	// Painel: tudo aqui pede usuário e senha.
	painel := api.Group("", autenticacao(cfg.PainelUsuario, cfg.PainelSenha))
	painel.GET("/pedidos", ped.Listar)
	painel.GET("/pedidos/:numero", ped.Buscar)
	painel.PATCH("/pedidos/:numero/status", ped.MudarStatus)

	// O mesmo site do GitHub Pages, servido pelo Go.
	r.NoRoute(gin.WrapH(http.FileServer(http.Dir(cfg.PastaWeb))))
	return r
}

// autenticacao usa HTTP Basic: o navegador pede usuário e senha uma vez.
// subtle.ConstantTimeCompare evita que o tempo de resposta denuncie a senha.
func autenticacao(usuario, senha string) gin.HandlerFunc {
	return func(c *gin.Context) {
		u, s, ok := c.Request.BasicAuth()
		if !ok ||
			subtle.ConstantTimeCompare([]byte(u), []byte(usuario)) != 1 ||
			subtle.ConstantTimeCompare([]byte(s), []byte(senha)) != 1 {
			c.Header("WWW-Authenticate", `Basic realm="Painel RiCar", charset="UTF-8"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"erro": "Usuário ou senha incorretos."})
			return
		}
		c.Next()
	}
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

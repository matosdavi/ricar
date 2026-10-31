// Package sessao cuida do login do painel: confere usuário e senha e guarda
// um cookie assinado que vale por 30 dias.
//
// Conceito Go: o cookie não guarda nada secreto. Ele tem a data de validade e
// uma assinatura HMAC feita com SESSAO_SEGREDO. Sem o segredo ninguém consegue
// fabricar um cookie válido, então o servidor não precisa guardar sessões no banco.
package sessao

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	NomeCookie = "ricar_sessao"
	Validade   = 30 * 24 * time.Hour
)

type Sessao struct {
	usuario, senha string
	segredo        []byte
	agora          func() time.Time
}

func Nova(usuario, senha, segredo string) *Sessao {
	return &Sessao{usuario: usuario, senha: senha, segredo: []byte(segredo), agora: time.Now}
}

func (s *Sessao) assinar(msg string) string {
	m := hmac.New(sha256.New, s.segredo)
	m.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// Gerar cria o valor do cookie: "<validade em segundos>.<assinatura>".
func (s *Sessao) Gerar() string {
	exp := strconv.FormatInt(s.agora().Add(Validade).Unix(), 10)
	return exp + "." + s.assinar(exp)
}

// Valido confere a assinatura e se ainda não venceu.
func (s *Sessao) Valido(valor string) bool {
	exp, assinatura, ok := strings.Cut(valor, ".")
	if !ok || !hmac.Equal([]byte(assinatura), []byte(s.assinar(exp))) {
		return false
	}
	n, err := strconv.ParseInt(exp, 10, 64)
	return err == nil && s.agora().Unix() < n
}

// confere usuário e senha sem vazar, pelo tempo de resposta, quantas letras acertou.
func (s *Sessao) confere(usuario, senha string) bool {
	u := subtle.ConstantTimeCompare([]byte(usuario), []byte(s.usuario))
	p := subtle.ConstantTimeCompare([]byte(senha), []byte(s.senha))
	return u&p == 1
}

func seguro(c *gin.Context) bool {
	return c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
}

func (s *Sessao) gravarCookie(c *gin.Context, valor string, idade int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     NomeCookie,
		Value:    valor,
		Path:     "/",
		MaxAge:   idade,
		HttpOnly: true, // o JavaScript da página não consegue ler o cookie
		Secure:   seguro(c),
		SameSite: http.SameSiteStrictMode, // outros sites não conseguem usar a sessão
	})
}

// Entrar: POST /api/sessao {"usuario":"...","senha":"..."}
func (s *Sessao) Entrar(c *gin.Context) {
	var body struct {
		Usuario string `json:"usuario"`
		Senha   string `json:"senha"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !s.confere(strings.TrimSpace(body.Usuario), body.Senha) {
		time.Sleep(500 * time.Millisecond) // atrasa quem fica tentando senhas
		c.JSON(http.StatusUnauthorized, gin.H{"erro": "Usuário ou senha incorretos."})
		return
	}
	s.gravarCookie(c, s.Gerar(), int(Validade.Seconds()))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Sair: DELETE /api/sessao
func (s *Sessao) Sair(c *gin.Context) {
	s.gravarCookie(c, "", -1)
	c.Status(http.StatusNoContent)
}

// Exigir é o middleware das rotas do painel.
func (s *Sessao) Exigir(c *gin.Context) {
	if v, err := c.Cookie(NomeCookie); err != nil || !s.Valido(v) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"erro": "Entre de novo para continuar."})
		return
	}
	c.Next()
}

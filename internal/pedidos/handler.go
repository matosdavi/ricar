package pedidos

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Handler liga as rotas HTTP ao repositório.
type Handler struct {
	Repo  Repositorio
	Agora func() time.Time // trocável nos testes
}

func NovoHandler(repo Repositorio) *Handler {
	return &Handler{Repo: repo, Agora: time.Now}
}

// Criar recebe o pedido do site. Rota pública: POST /api/pedidos
func (h *Handler) Criar(c *gin.Context) {
	var p NovoPedido
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10) // 16 KB é muito para um pedido
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Não conseguimos ler o pedido."})
		return
	}
	if p.Site != "" { // robô preencheu o campo escondido: finge que deu certo e descarta
		c.JSON(http.StatusCreated, Criado{CriadoEm: h.Agora()})
		return
	}
	p.Normalizar()
	if erros := p.Validar(h.Agora()); erros != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"erro": "Alguns campos precisam de ajuste.", "erros": erros})
		return
	}
	criado, err := h.Repo.Criar(c.Request.Context(), p)
	if err != nil {
		slog.Error("criar pedido", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos registrar o pedido agora."})
		return
	}
	slog.Info("pedido criado", "numero", criado.Numero)
	c.JSON(http.StatusCreated, criado)
}

// Listar mostra os pedidos no painel. GET /api/pedidos?status=novo&limite=50
func (h *Handler) Listar(c *gin.Context) {
	status := c.Query("status")
	if status != "" && !StatusValido(status) {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Status inválido.", "validos": Status})
		return
	}
	limite, _ := strconv.Atoi(c.DefaultQuery("limite", "50"))
	if limite < 1 || limite > 200 {
		limite = 50
	}
	lista, err := h.Repo.Listar(c.Request.Context(), status, limite)
	if err != nil {
		slog.Error("listar pedidos", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos carregar os pedidos."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"pedidos": lista})
}

// Buscar traz um pedido completo. GET /api/pedidos/:numero
func (h *Handler) Buscar(c *gin.Context) {
	d, err := h.Repo.Buscar(c.Request.Context(), strings.ToUpper(c.Param("numero")))
	if errors.Is(err, ErrNaoEncontrado) {
		c.JSON(http.StatusNotFound, gin.H{"erro": "Pedido não encontrado."})
		return
	}
	if err != nil {
		slog.Error("buscar pedido", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos carregar o pedido."})
		return
	}
	c.JSON(http.StatusOK, d)
}

// MudarStatus avança o pedido no atendimento. PATCH /api/pedidos/:numero/status
func (h *Handler) MudarStatus(c *gin.Context) {
	var body struct {
		Status string `json:"status"`
		Nota   string `json:"nota"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !StatusValido(body.Status) {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Status inválido.", "validos": Status})
		return
	}
	if r := []rune(strings.TrimSpace(body.Nota)); len(r) > 300 {
		body.Nota = string(r[:300])
	}
	err := h.Repo.MudarStatus(c.Request.Context(), strings.ToUpper(c.Param("numero")), body.Status, strings.TrimSpace(body.Nota))
	if errors.Is(err, ErrNaoEncontrado) {
		c.JSON(http.StatusNotFound, gin.H{"erro": "Pedido não encontrado."})
		return
	}
	if err != nil {
		slog.Error("mudar status", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos mudar o status."})
		return
	}
	c.Status(http.StatusNoContent)
}

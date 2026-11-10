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

// CriarPainel cadastra o pedido de quem chamou direto no WhatsApp. POST /api/painel/pedidos
func (h *Handler) CriarPainel(c *gin.Context) {
	var p NovoPedido
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Não conseguimos ler o pedido."})
		return
	}
	p.Site, p.ViaPainel = "", true
	p.Normalizar()
	if erros := p.ValidarPainel(h.Agora()); erros != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"erro": "Alguns campos precisam de ajuste.", "erros": erros})
		return
	}
	criado, err := h.Repo.Criar(c.Request.Context(), p)
	if err != nil {
		slog.Error("criar pedido (painel)", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos registrar o pedido agora."})
		return
	}
	c.JSON(http.StatusCreated, criado)
}

// Atualizar grava telefone, valor, sinal e data. PATCH /api/painel/pedidos/:numero
func (h *Handler) Atualizar(c *gin.Context) {
	var d Dados
	if err := c.ShouldBindJSON(&d); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Não conseguimos ler os dados."})
		return
	}
	if erros := d.Validar(); erros != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"erro": "Alguns campos precisam de ajuste.", "erros": erros})
		return
	}
	err := h.Repo.Atualizar(c.Request.Context(), strings.ToUpper(c.Param("numero")), d)
	if errors.Is(err, ErrNaoEncontrado) {
		c.JSON(http.StatusNotFound, gin.H{"erro": "Pedido não encontrado."})
		return
	}
	if err != nil {
		slog.Error("atualizar pedido", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos salvar."})
		return
	}
	c.Status(http.StatusNoContent)
}

// Listar mostra os pedidos no painel. GET /api/painel/pedidos?abertos=1 ou ?status=novo
func (h *Handler) Listar(c *gin.Context) {
	status := c.Query("status")
	if status != "" && !StatusValido(status) {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Status inválido.", "validos": Status})
		return
	}
	limite, _ := strconv.Atoi(c.DefaultQuery("limite", "200"))
	if limite < 1 || limite > 500 {
		limite = 200
	}
	f := Filtro{Status: status, Abertos: c.Query("abertos") == "1", Limite: limite}
	lista, err := h.Repo.Listar(c.Request.Context(), f)
	if err != nil {
		slog.Error("listar pedidos", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos carregar os pedidos."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"pedidos": lista})
}

// Buscar traz um pedido completo. GET /api/painel/pedidos/:numero
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

// MudarStatus avança o pedido no atendimento. PATCH /api/painel/pedidos/:numero/status
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

// SalvarOrcamento guarda o cálculo da calculadora no pedido. PUT /api/painel/pedidos/:numero/orcamento
func (h *Handler) SalvarOrcamento(c *gin.Context) {
	var o Orcamento
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
	if err := c.ShouldBindJSON(&o); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Não conseguimos ler o orçamento."})
		return
	}
	if erros := o.Validar(); erros != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"erro": "O orçamento precisa de ajuste.", "erros": erros})
		return
	}
	err := h.Repo.SalvarOrcamento(c.Request.Context(), strings.ToUpper(c.Param("numero")), o)
	if errors.Is(err, ErrNaoEncontrado) {
		c.JSON(http.StatusNotFound, gin.H{"erro": "Pedido não encontrado."})
		return
	}
	if err != nil {
		slog.Error("salvar orçamento", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos salvar o orçamento."})
		return
	}
	c.Status(http.StatusNoContent)
}

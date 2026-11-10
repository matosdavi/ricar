package calculadora

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repositorio é o que o handler precisa do banco (nos testes, uma versão em memória).
type Repositorio interface {
	Carregar(ctx context.Context) (Bases, *time.Time, error)
	Salvar(ctx context.Context, b Bases) (time.Time, error)
}

// RepoPG guarda as bases na tabela calculadora (uma linha só, id = 1).
type RepoPG struct{ pool *pgxpool.Pool }

func NovoRepoPG(pool *pgxpool.Pool) *RepoPG { return &RepoPG{pool: pool} }

// Carregar devolve as bases salvas (mescladas com o padrão) ou o padrão, se nunca salvou.
// O horário vem nil quando nunca salvou.
func (r *RepoPG) Carregar(ctx context.Context) (Bases, *time.Time, error) {
	var bruto []byte
	var quando time.Time
	err := r.pool.QueryRow(ctx, `SELECT bases, atualizado_em FROM calculadora WHERE id = 1`).Scan(&bruto, &quando)
	if errors.Is(err, pgx.ErrNoRows) {
		return Padrao(), nil, nil
	}
	if err != nil {
		return Bases{}, nil, err
	}
	var salvas Bases
	if err := json.Unmarshal(bruto, &salvas); err != nil {
		return Bases{}, nil, err
	}
	return Mesclar(salvas), &quando, nil
}

// Salvar grava as bases. "ON CONFLICT ... DO UPDATE" = insere na primeira vez, atualiza nas outras.
func (r *RepoPG) Salvar(ctx context.Context, b Bases) (time.Time, error) {
	bruto, err := json.Marshal(b)
	if err != nil {
		return time.Time{}, err
	}
	var quando time.Time
	err = r.pool.QueryRow(ctx, `
		INSERT INTO calculadora (id, bases, atualizado_em) VALUES (1, $1, now())
		ON CONFLICT (id) DO UPDATE SET bases = EXCLUDED.bases, atualizado_em = now()
		RETURNING atualizado_em`, bruto).Scan(&quando)
	return quando, err
}

// Handler liga as rotas do painel ao repositório.
type Handler struct{ Repo Repositorio }

func NovoHandler(repo Repositorio) *Handler { return &Handler{Repo: repo} }

// resposta leva também o padrão, para a tela "Preços" poder voltar aos valores iniciais
// e mostrar o que foi mudado.
type resposta struct {
	Bases        Bases      `json:"bases"`
	Padrao       Bases      `json:"padrao"`
	AtualizadoEm *time.Time `json:"atualizado_em"`
}

// Buscar: GET /api/painel/calculadora
func (h *Handler) Buscar(c *gin.Context) {
	b, quando, err := h.Repo.Carregar(c.Request.Context())
	if err != nil {
		slog.Error("carregar calculadora", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos carregar os preços."})
		return
	}
	c.JSON(http.StatusOK, resposta{Bases: b, Padrao: Padrao(), AtualizadoEm: quando})
}

// Salvar: PUT /api/painel/calculadora
func (h *Handler) Salvar(c *gin.Context) {
	var recebidas Bases
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
	if err := c.ShouldBindJSON(&recebidas); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"erro": "Não conseguimos ler os preços."})
		return
	}
	b := Mesclar(recebidas) // só os números que existem no catálogo entram
	if erros := b.Validar(); erros != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"erro": "Alguns valores precisam de ajuste.", "erros": erros})
		return
	}
	quando, err := h.Repo.Salvar(c.Request.Context(), b)
	if err != nil {
		slog.Error("salvar calculadora", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos salvar os preços."})
		return
	}
	c.JSON(http.StatusOK, resposta{Bases: b, Padrao: Padrao(), AtualizadoEm: &quando})
}

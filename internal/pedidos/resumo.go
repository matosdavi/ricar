package pedidos

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Horário de Brasília. O Brasil não tem mais horário de verão, então um fuso fixo de -3 h
// serve. (A imagem do servidor não traz a tabela de fusos, por isso não usamos
// time.LoadLocation("America/Sao_Paulo").)
var brasilia = time.FixedZone("BRT", -3*60*60)

// Contagem é uma linha de "serviços mais pedidos" ou "como conheceram".
type Contagem struct {
	Nome       string `json:"nome"`
	Quantidade int    `json:"quantidade"`
}

// ResumoMes é o retrato de um mês para a aba Resumo do painel.
type ResumoMes struct {
	Mes           string     `json:"mes"` // "2026-11"
	Recebidos     int        `json:"recebidos"`
	ComOrcamento  int        `json:"com_orcamento"`
	Fechados      int        `json:"fechados"` // agendado, em serviço, pronto ou finalizado
	Cancelados    int        `json:"cancelados"`
	ValorFechado  int        `json:"valor_fechado_centavos"`
	Sinais        int        `json:"sinais_centavos"`
	Entregues     int        `json:"entregues"` // finalizados neste mês (de qualquer mês de chegada)
	ValorEntregue int        `json:"valor_entregue_centavos"`
	Servicos      []Contagem `json:"servicos"`
	Origens       []Contagem `json:"origens"`
}

// fechado = o cliente aceitou: daqui em diante o pedido vira serviço.
const statusFechados = `('agendado', 'em_servico', 'pronto', 'finalizado')`

// ResumoMes junta os números do mês. Os pedidos contados são os que chegaram no mês.
func (r *RepoPG) ResumoMes(ctx context.Context, inicio, fim time.Time) (ResumoMes, error) {
	var m ResumoMes
	err := r.pool.QueryRow(ctx, `
		SELECT count(*),
		       count(*) FILTER (WHERE valor_orcado_centavos IS NOT NULL),
		       count(*) FILTER (WHERE status IN `+statusFechados+`),
		       count(*) FILTER (WHERE status = 'cancelado'),
		       COALESCE(sum(valor_orcado_centavos) FILTER (WHERE status IN `+statusFechados+`), 0),
		       COALESCE(sum(sinal_centavos) FILTER (WHERE status IN `+statusFechados+`), 0)
		FROM pedidos WHERE criado_em >= $1 AND criado_em < $2`, inicio, fim).
		Scan(&m.Recebidos, &m.ComOrcamento, &m.Fechados, &m.Cancelados, &m.ValorFechado, &m.Sinais)
	if err != nil {
		return m, err
	}
	// entregues: pedidos finalizados cuja finalização aconteceu neste mês
	err = r.pool.QueryRow(ctx, `
		SELECT count(*), COALESCE(sum(p.valor_orcado_centavos), 0)
		FROM pedidos p
		WHERE p.status = 'finalizado'
		  AND (SELECT max(e.criado_em) FROM pedido_eventos e WHERE e.pedido_id = p.id AND e.status = 'finalizado') >= $1
		  AND (SELECT max(e.criado_em) FROM pedido_eventos e WHERE e.pedido_id = p.id AND e.status = 'finalizado') < $2`,
		inicio, fim).Scan(&m.Entregues, &m.ValorEntregue)
	if err != nil {
		return m, err
	}
	if m.Servicos, err = r.contar(ctx, `
		SELECT i.servico, sum(i.quantidade)::INT FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
		WHERE p.criado_em >= $1 AND p.criado_em < $2 GROUP BY 1 ORDER BY 2 DESC, 1`, inicio, fim); err != nil {
		return m, err
	}
	m.Origens, err = r.contar(ctx, `
		SELECT COALESCE(NULLIF(c.origem, ''), 'Não informado'), count(*)::INT FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
		WHERE p.criado_em >= $1 AND p.criado_em < $2 GROUP BY 1 ORDER BY 2 DESC, 1`, inicio, fim)
	return m, err
}

func (r *RepoPG) contar(ctx context.Context, sql string, args ...any) ([]Contagem, error) {
	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lista := []Contagem{} // lista vazia vira [] no JSON, e não null
	for rows.Next() {
		var c Contagem
		if err := rows.Scan(&c.Nome, &c.Quantidade); err != nil {
			return nil, err
		}
		lista = append(lista, c)
	}
	return lista, rows.Err()
}

// Resumo: GET /api/painel/resumo?mes=2026-11 (sem mes = mês atual)
func (h *Handler) Resumo(c *gin.Context) {
	agora := h.Agora().In(brasilia)
	inicio := time.Date(agora.Year(), agora.Month(), 1, 0, 0, 0, 0, brasilia)
	if q := c.Query("mes"); q != "" {
		t, err := time.ParseInLocation("2006-01", q, brasilia)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"erro": "Mês inválido. Use 2026-11."})
			return
		}
		inicio = t
	}
	fim := inicio.AddDate(0, 1, 0) // AddDate cuida de meses com 28, 30 ou 31 dias
	m, err := h.Repo.ResumoMes(c.Request.Context(), inicio, fim)
	if err != nil {
		slog.Error("resumo do mês", "erro", err)
		c.JSON(http.StatusInternalServerError, gin.H{"erro": "Não conseguimos carregar o resumo."})
		return
	}
	m.Mes = inicio.Format("2006-01")
	c.JSON(http.StatusOK, m)
}

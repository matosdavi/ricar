package pedidos

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNaoEncontrado = errors.New("pedido não encontrado")

// Repositorio é o que o handler precisa do banco.
//
// Conceito Go: interfaces são satisfeitas sem declarar "implements". Qualquer
// tipo com esses métodos serve. Nos testes usamos um repositório falso em
// memória; em produção, o RepoPG abaixo.
type Repositorio interface {
	Criar(ctx context.Context, p NovoPedido) (Criado, error)
	Listar(ctx context.Context, f Filtro) ([]Resumo, error)
	Buscar(ctx context.Context, numero string) (Detalhe, error)
	MudarStatus(ctx context.Context, numero, status, nota string) error
	Atualizar(ctx context.Context, numero string, d Dados) error
	SalvarOrcamento(ctx context.Context, numero string, o Orcamento) error
	ResumoMes(ctx context.Context, inicio, fim time.Time) (ResumoMes, error)
}

type RepoPG struct{ pool *pgxpool.Pool }

func NovoRepoPG(pool *pgxpool.Pool) *RepoPG { return &RepoPG{pool: pool} }

func vazioParaNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// Criar grava cliente, pedido, itens e o primeiro evento numa transação só.
func (r *RepoPG) Criar(ctx context.Context, p NovoPedido) (Criado, error) {
	var out Criado
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var clienteID int64
		if err := tx.QueryRow(ctx,
			`INSERT INTO clientes (nome, telefone, cidade_bairro, origem) VALUES ($1, $2, $3, $4) RETURNING id`,
			p.Nome, vazioParaNil(p.Telefone), vazioParaNil(p.CidadeBairro), vazioParaNil(p.Origem),
		).Scan(&clienteID); err != nil {
			return err
		}

		var ano *int
		if p.Ano != "" {
			if n, err := strconv.Atoi(p.Ano); err == nil {
				ano = &n
			}
		}
		var pedidoID int64
		if err := tx.QueryRow(ctx, `
			INSERT INTO pedidos (cliente_id, veiculo_modelo, veiculo_ano, veiculo_porte, veiculo_cor,
			                     tipo_pintura, tem_amassado, observacao, preferencia_data, referencia)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id, numero, criado_em`,
			clienteID, p.Modelo, ano, p.Porte, vazioParaNil(p.Cor), vazioParaNil(p.TipoPintura),
			p.TemAmassado, vazioParaNil(p.Observacao), vazioParaNil(p.Preferencia), vazioParaNil(p.Referencia),
		).Scan(&pedidoID, &out.Numero, &out.CriadoEm); err != nil {
			return err
		}

		nota := "Pedido feito pelo site"
		if p.ViaPainel {
			nota = "Cadastrado no painel"
		}
		// Batch manda vários INSERTs numa ida só ao banco.
		b := &pgx.Batch{}
		for _, it := range p.Itens {
			b.Queue(`INSERT INTO pedido_itens (pedido_id, servico, quantidade) VALUES ($1, $2, $3)`,
				pedidoID, it.Servico, it.Quantidade)
		}
		b.Queue(`INSERT INTO pedido_eventos (pedido_id, status, nota) VALUES ($1, 'novo', $2)`, pedidoID, nota)
		return tx.SendBatch(ctx, b).Close()
	})
	return out, err
}

// Colunas comuns da lista e do detalhe, na mesma ordem do scanResumo.
const colunasResumo = `
	p.id, p.numero, p.status::TEXT, c.nome, COALESCE(c.cidade_bairro, ''), COALESCE(c.telefone, ''),
	p.veiculo_modelo || COALESCE(' ' || p.veiculo_ano, '') || ' · ' || p.veiculo_porte,
	p.criado_em, p.atualizado_em, to_char(p.data_agendada, 'YYYY-MM-DD'), COALESCE(p.referencia, '')`

func scanResumo(id *int64, s *Resumo) []any {
	return []any{id, &s.Numero, &s.Status, &s.Cliente, &s.CidadeBairro, &s.Telefone, &s.Veiculo, &s.CriadoEm, &s.AtualizadoEm, &s.DataAgendada, &s.Referencia}
}

// Listar traz os pedidos, os parados há mais tempo primeiro dentro de cada etapa.
func (r *RepoPG) Listar(ctx context.Context, f Filtro) ([]Resumo, error) {
	q := `SELECT ` + colunasResumo + ` FROM pedidos p JOIN clientes c ON c.id = p.cliente_id`
	args := []any{}
	switch {
	case f.Status != "":
		q += ` WHERE p.status = $1::status_pedido`
		args = append(args, f.Status)
	case f.Abertos:
		q += ` WHERE p.status NOT IN ('finalizado', 'cancelado')`
	}
	if f.Abertos || f.Status != "" {
		q += ` ORDER BY p.atualizado_em ASC`
	} else {
		q += ` ORDER BY p.atualizado_em DESC`
	}
	q += ` LIMIT ` + strconv.Itoa(f.Limite)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	lista := []Resumo{}
	ids := []int64{}
	porID := map[int64]int{}
	for rows.Next() {
		var id int64
		var s Resumo
		if err := rows.Scan(scanResumo(&id, &s)...); err != nil {
			return nil, err
		}
		s.Itens = []Item{}
		porID[id] = len(lista)
		ids = append(ids, id)
		lista = append(lista, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return lista, nil
	}

	// Itens de todos os pedidos numa consulta só (em vez de uma por pedido).
	irows, err := r.pool.Query(ctx,
		`SELECT pedido_id, servico, quantidade FROM pedido_itens WHERE pedido_id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return nil, err
	}
	defer irows.Close()
	for irows.Next() {
		var pid int64
		var it Item
		if err := irows.Scan(&pid, &it.Servico, &it.Quantidade); err != nil {
			return nil, err
		}
		i := porID[pid]
		lista[i].Itens = append(lista[i].Itens, it)
	}
	return lista, irows.Err()
}

func (r *RepoPG) Buscar(ctx context.Context, numero string) (Detalhe, error) {
	var d Detalhe
	var id int64
	var cor, tinta, obs, pref, origem *string
	var ano *int16
	var orc []byte // JSONB; nil quando o pedido ainda não tem orçamento calculado
	dest := append(scanResumo(&id, &d.Resumo),
		&ano, &d.Porte, &cor, &tinta, &d.TemAmassado, &obs, &pref, &origem, &d.ValorOrcado, &d.Sinal, &orc)
	err := r.pool.QueryRow(ctx, `
		SELECT `+colunasResumo+`,
		       p.veiculo_ano, p.veiculo_porte, p.veiculo_cor, p.tipo_pintura, p.tem_amassado,
		       p.observacao, p.preferencia_data, c.origem, p.valor_orcado_centavos, p.sinal_centavos, p.orcamento
		FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
		WHERE p.numero = $1`, numero).Scan(dest...)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNaoEncontrado
	}
	if err != nil {
		return d, err
	}
	if ano != nil {
		a := int(*ano)
		d.Ano = &a
	}
	d.Cor, d.TipoPintura, d.Observacao, d.Preferencia, d.Origem = deref(cor), deref(tinta), deref(obs), deref(pref), deref(origem)
	if len(orc) > 0 {
		d.Orcamento = orc
	}

	d.Itens = []Item{}
	rows, err := r.pool.Query(ctx, `SELECT servico, quantidade FROM pedido_itens WHERE pedido_id = $1 ORDER BY id`, id)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.Servico, &it.Quantidade); err != nil {
			rows.Close()
			return d, err
		}
		d.Itens = append(d.Itens, it)
	}
	rows.Close()

	d.Eventos = []Evento{}
	rows, err = r.pool.Query(ctx, `SELECT status::TEXT, COALESCE(nota, ''), criado_em FROM pedido_eventos WHERE pedido_id = $1 ORDER BY criado_em, id`, id)
	if err != nil {
		return d, err
	}
	defer rows.Close()
	for rows.Next() {
		var e Evento
		if err := rows.Scan(&e.Status, &e.Nota, &e.CriadoEm); err != nil {
			return d, err
		}
		d.Eventos = append(d.Eventos, e)
	}
	return d, rows.Err()
}

func (r *RepoPG) MudarStatus(ctx context.Context, numero, status, nota string) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var id int64
		err := tx.QueryRow(ctx,
			`UPDATE pedidos SET status = $2::status_pedido, atualizado_em = now() WHERE numero = $1 RETURNING id`,
			numero, status).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNaoEncontrado
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO pedido_eventos (pedido_id, status, nota) VALUES ($1, $2::status_pedido, $3)`,
			id, status, vazioParaNil(nota))
		return err
	})
}

// Atualizar grava valor, sinal, data e o telefone do cliente.
func (r *RepoPG) Atualizar(ctx context.Context, numero string, d Dados) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var clienteID int64
		err := tx.QueryRow(ctx, `
			UPDATE pedidos SET valor_orcado_centavos = $2, sinal_centavos = $3, data_agendada = $4::DATE, atualizado_em = now()
			WHERE numero = $1 RETURNING cliente_id`,
			numero, d.ValorOrcado, d.Sinal, d.DataAgendada).Scan(&clienteID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNaoEncontrado
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE clientes SET telefone = $2 WHERE id = $1`, clienteID, vazioParaNil(d.Telefone))
		return err
	})
}

// SalvarOrcamento grava o cálculo, o valor e o sinal, e anota no histórico.
func (r *RepoPG) SalvarOrcamento(ctx context.Context, numero string, o Orcamento) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var id int64
		var status string
		err := tx.QueryRow(ctx, `
			UPDATE pedidos SET orcamento = $2, valor_orcado_centavos = $3, sinal_centavos = $4, atualizado_em = now()
			WHERE numero = $1 RETURNING id, status::TEXT`,
			numero, o.Calculo, o.Valor, o.Sinal).Scan(&id, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNaoEncontrado
		}
		if err != nil {
			return err
		}
		nota := "Orçamento calculado: " + reaisTexto(o.Valor)
		if o.Enviado {
			nota = "Orçamento enviado pelo WhatsApp: " + reaisTexto(o.Valor)
			if status == "novo" || status == "aguardando_fotos" {
				status = "orcamento_enviado"
				if _, err := tx.Exec(ctx, `UPDATE pedidos SET status = 'orcamento_enviado' WHERE id = $1`, id); err != nil {
					return err
				}
			}
		}
		// o histórico guarda a etapa (nova ou a mesma) com a anotação
		_, err = tx.Exec(ctx, `INSERT INTO pedido_eventos (pedido_id, status, nota) VALUES ($1, $2::status_pedido, $3)`,
			id, status, nota)
		return err
	})
}

// reaisTexto escreve centavos como "R$ 1.250" (ou "R$ 1.250,50").
func reaisTexto(centavos int) string {
	inteiro, resto := centavos/100, centavos%100
	s := strconv.Itoa(inteiro)
	for i := len(s) - 3; i > 0; i -= 3 { // ponto a cada 3 dígitos, da direita para a esquerda
		s = s[:i] + "." + s[i:]
	}
	if resto != 0 {
		s += fmt.Sprintf(",%02d", resto)
	}
	return "R$ " + s
}

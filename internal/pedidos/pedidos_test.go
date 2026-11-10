package pedidos

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

var hoje = time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)

func pedidoOK() NovoPedido {
	return NovoPedido{
		Itens:        []Item{{Servico: "parachoque", Quantidade: 1}, {Servico: "porta", Quantidade: 2}},
		Modelo:       "Onix",
		Ano:          "2019",
		Porte:        "Hatch",
		Nome:         "Davi",
		CidadeBairro: "Embu das Artes, Centro",
	}
}

// Conceito Go: "table-driven test". Cada linha é um cenário; o loop roda todos.
func TestValidar(t *testing.T) {
	casos := []struct {
		nome  string
		mudar func(p *NovoPedido)
		campo string // campo que deve dar erro ("" = nenhum)
	}{
		{"pedido certo", func(p *NovoPedido) {}, ""},
		{"sem serviço", func(p *NovoPedido) { p.Itens = nil }, "itens"},
		{"serviço inventado", func(p *NovoPedido) { p.Itens = []Item{{"rodas", 1}} }, "itens"},
		{"5 portas", func(p *NovoPedido) { p.Itens = []Item{{"porta", 5}} }, "itens"},
		{"capô com quantidade 2", func(p *NovoPedido) { p.Itens = []Item{{"capo", 2}} }, "itens"},
		{"serviço repetido", func(p *NovoPedido) { p.Itens = []Item{{"porta", 1}, {"porta", 1}} }, "itens"},
		{"completa com outra peça", func(p *NovoPedido) { p.Itens = []Item{{"completa", 1}, {"capo", 1}} }, "itens"},
		{"completa sozinha", func(p *NovoPedido) { p.Itens = []Item{{"completa", 1}} }, ""},
		{"sem modelo", func(p *NovoPedido) { p.Modelo = "" }, "modelo"},
		{"ano com 2 dígitos", func(p *NovoPedido) { p.Ano = "19" }, "ano"},
		{"ano no futuro", func(p *NovoPedido) { p.Ano = "2030" }, "ano"},
		{"ano em branco é ok", func(p *NovoPedido) { p.Ano = "" }, ""},
		{"porte inventado", func(p *NovoPedido) { p.Porte = "Caminhão" }, "porte"},
		{"sem nome", func(p *NovoPedido) { p.Nome = " " }, "nome"},
		{"sem bairro", func(p *NovoPedido) { p.CidadeBairro = "" }, "cidade_bairro"},
	}
	for _, tc := range casos {
		t.Run(tc.nome, func(t *testing.T) {
			p := pedidoOK()
			tc.mudar(&p)
			p.Normalizar()
			erros := p.Validar(hoje)
			if tc.campo == "" && erros != nil {
				t.Fatalf("esperava sem erro, veio %v", erros)
			}
			if tc.campo != "" && erros[tc.campo] == "" {
				t.Fatalf("esperava erro em %q, veio %v", tc.campo, erros)
			}
		})
	}
}

// repoFalso guarda os pedidos em memória: testa o handler sem banco.
type repoFalso struct {
	criados     []NovoPedido
	inicio, fim time.Time // último mês pedido ao ResumoMes
}

func (r *repoFalso) Criar(_ context.Context, p NovoPedido) (Criado, error) {
	r.criados = append(r.criados, p)
	return Criado{Numero: "BP-00001", CriadoEm: hoje}, nil
}
func (r *repoFalso) Listar(context.Context, Filtro) ([]Resumo, error)         { return []Resumo{}, nil }
func (r *repoFalso) Atualizar(context.Context, string, Dados) error           { return nil }
func (r *repoFalso) SalvarOrcamento(context.Context, string, Orcamento) error { return nil }
func (r *repoFalso) ResumoMes(_ context.Context, inicio, fim time.Time) (ResumoMes, error) {
	r.inicio, r.fim = inicio, fim
	return ResumoMes{Servicos: []Contagem{}, Origens: []Contagem{}}, nil
}
func (r *repoFalso) Buscar(context.Context, string) (Detalhe, error) {
	return Detalhe{}, ErrNaoEncontrado
}
func (r *repoFalso) MudarStatus(context.Context, string, string, string) error {
	return ErrNaoEncontrado
}

func postar(t *testing.T, h *Handler, corpo any) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/pedidos", h.Criar)
	b, _ := json.Marshal(corpo)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/pedidos", bytes.NewReader(b)))
	return w
}

func TestCriarHandler(t *testing.T) {
	repo := &repoFalso{}
	h := &Handler{Repo: repo, Agora: func() time.Time { return hoje }}

	t.Run("cria e devolve o número", func(t *testing.T) {
		w := postar(t, h, pedidoOK())
		if w.Code != http.StatusCreated {
			t.Fatalf("status %d: %s", w.Code, w.Body)
		}
		var out Criado
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		if out.Numero != "BP-00001" {
			t.Fatalf("número %q", out.Numero)
		}
	})

	t.Run("inválido devolve 422 com os campos", func(t *testing.T) {
		p := pedidoOK()
		p.Nome = ""
		w := postar(t, h, p)
		if w.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status %d", w.Code)
		}
		var out struct{ Erros map[string]string }
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		if out.Erros["nome"] == "" {
			t.Fatalf("faltou erro de nome: %s", w.Body)
		}
	})

	t.Run("robô (campo escondido) não grava", func(t *testing.T) {
		antes := len(repo.criados)
		p := pedidoOK()
		p.Site = "http://spam"
		if w := postar(t, h, p); w.Code != http.StatusCreated {
			t.Fatalf("status %d", w.Code)
		}
		if len(repo.criados) != antes {
			t.Fatal("pedido de robô foi gravado")
		}
	})
}

func TestValidarPainel(t *testing.T) {
	p := pedidoOK()
	p.CidadeBairro = "" // no painel, bairro é opcional
	p.Telefone = "(11) 9 9999-8888"
	p.Normalizar()
	if e := p.ValidarPainel(hoje); e != nil {
		t.Fatalf("esperava sem erro, veio %v", e)
	}
	p.Telefone = "9999"
	if e := p.ValidarPainel(hoje); e["telefone"] == "" {
		t.Fatalf("telefone curto deveria dar erro: %v", e)
	}
}

func TestValidarDados(t *testing.T) {
	v, s := 50000, 60000
	d := Dados{ValorOrcado: &v, Sinal: &s}
	if e := d.Validar(); e["sinal_centavos"] == "" {
		t.Fatal("sinal maior que o valor deveria dar erro")
	}
	data := "31/12/2026"
	d = Dados{DataAgendada: &data}
	if e := d.Validar(); e["data_agendada"] == "" {
		t.Fatal("data fora do formato deveria dar erro")
	}
	vazia := ""
	d = Dados{DataAgendada: &vazia, Telefone: "11 99999-8888"}
	if e := d.Validar(); e != nil || d.DataAgendada != nil || d.Telefone != "11999998888" {
		t.Fatalf("data vazia deveria virar nil e telefone só dígitos: %v %+v", e, d)
	}
}

func TestValidarOrcamento(t *testing.T) {
	ok := Orcamento{Calculo: json.RawMessage(`{"total":850}`), Valor: 85000, Sinal: 42500}
	if e := ok.Validar(); e != nil {
		t.Fatalf("orçamento certo deu erro: %v", e)
	}
	casos := map[string]Orcamento{
		"valor zero":         {Calculo: ok.Calculo, Valor: 0},
		"sinal maior":        {Calculo: ok.Calculo, Valor: 100, Sinal: 200},
		"cálculo vazio":      {Valor: 100},
		"cálculo não objeto": {Calculo: json.RawMessage(`[1,2]`), Valor: 100},
	}
	for nome, o := range casos {
		if o.Validar() == nil {
			t.Errorf("%s: deveria dar erro", nome)
		}
	}
	if got := reaisTexto(125050); got != "R$ 1.250,50" {
		t.Errorf("reaisTexto = %q", got)
	}
	if got := reaisTexto(85000); got != "R$ 850" {
		t.Errorf("reaisTexto = %q", got)
	}
}

func TestResumoMes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := &repoFalso{}
	h := NovoHandler(repo)
	h.Agora = func() time.Time { return time.Date(2026, 12, 1, 1, 0, 0, 0, time.UTC) } // ainda 30/11 em Brasília
	r := gin.New()
	r.GET("/r", h.Resumo)

	casos := []struct {
		url, mes string
		codigo   int
	}{
		{"/r", "2026-11", 200},
		{"/r?mes=2026-02", "2026-02", 200},
		{"/r?mes=fevereiro", "", 400},
	}
	for _, c := range casos {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", c.url, nil))
		if w.Code != c.codigo {
			t.Errorf("%s: código %d", c.url, w.Code)
			continue
		}
		if c.codigo == 200 {
			var m ResumoMes
			json.Unmarshal(w.Body.Bytes(), &m)
			if m.Mes != c.mes || repo.fim.Sub(repo.inicio) < 28*24*time.Hour {
				t.Errorf("%s: mês %q, de %v a %v", c.url, m.Mes, repo.inicio, repo.fim)
			}
		}
	}
}

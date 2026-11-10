package calculadora

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestPadraoValido(t *testing.T) {
	if e := Padrao().Validar(); e != nil {
		t.Fatalf("padrão deveria ser válido: %v", e)
	}
}

func TestPadraoEhCopia(t *testing.T) {
	a := Padrao()
	a.Servicos[0].Material = 999
	if Padrao().Servicos[0].Material == 999 {
		t.Fatal("mexer numa cópia mudou o padrão")
	}
}

func TestMesclar(t *testing.T) {
	salvas := Bases{
		Servicos: []Servico{
			{ID: "porta", Nome: "Nome inventado", Material: 200, Horas: 7, MercadoMin: ptr(500), MercadoMax: ptr(1100)},
			{ID: "rodas", Material: 10, Horas: 1}, // não existe no catálogo: ignora
			{ID: "esmaecimento", Material: 70, Horas: 2.5, MercadoMin: ptr(1), MercadoMax: ptr(2)},
			{ID: "capo", Material: 210, Horas: 7}, // mercado null: mantém a faixa padrão
		},
		Portes: []Fator{{ID: "suv", Fator: 1.4}},
		Hora:   45, HorasDia: 9, Reserva: 12, SugerirCompleta: 80,
	}
	b := Mesclar(salvas)
	porta := b.Servicos[1]
	if porta.Nome != "Porta" || porta.Material != 200 || porta.Horas != 7 || *porta.MercadoMin != 500 {
		t.Errorf("porta errada: %+v", porta)
	}
	if len(b.Servicos) != len(Padrao().Servicos) {
		t.Errorf("serviço desconhecido entrou na lista")
	}
	for _, s := range b.Servicos {
		if s.ID == "esmaecimento" && (s.MercadoMin != nil || s.Material != 70) {
			t.Errorf("esmaecimento errado: %+v", s)
		}
		if s.ID == "capo" && (s.MercadoMin == nil || *s.MercadoMin != 600) {
			t.Errorf("capô perdeu a faixa de mercado: %+v", s)
		}
	}
	if b.Portes[2].Fator != 1.4 || b.Portes[1].Fator != 1.12 {
		t.Errorf("portes errados: %+v", b.Portes)
	}
	if b.Hora != 45 || b.Troca { // troca veio false nas salvas
		t.Errorf("custos errados: hora %v troca %v", b.Hora, b.Troca)
	}
	// nada salvo: fica tudo no padrão
	if v := Mesclar(Bases{}); v.Hora != 35 || !v.Troca {
		t.Errorf("bases vazias deveriam dar o padrão: %+v", v)
	}
}

func TestValidar(t *testing.T) {
	casos := []struct {
		nome  string
		mudar func(b *Bases)
		campo string
	}{
		{"hora zero", func(b *Bases) { b.Hora = 0 }, "hora"},
		{"material negativo", func(b *Bases) { b.Servicos[0].Material = -1 }, "material_parachoque"},
		{"mercado invertido", func(b *Bases) { *b.Servicos[1].MercadoMin = 2000 }, "mercado_porta"},
		{"fator absurdo", func(b *Bases) { b.Tintas[1].Fator = 10 }, "fator_metalica"},
		{"reserva alta", func(b *Bases) { b.Reserva = 90 }, "reserva"},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			b := Padrao()
			c.mudar(&b)
			if e := b.Validar(); e[c.campo] == "" {
				t.Errorf("esperava erro em %q, veio %v", c.campo, e)
			}
		})
	}
}

// repoFalso guarda as bases em memória.
type repoFalso struct {
	b      *Bases
	quando time.Time
}

func (r *repoFalso) Carregar(context.Context) (Bases, *time.Time, error) {
	if r.b == nil {
		return Padrao(), nil, nil
	}
	return *r.b, &r.quando, nil
}
func (r *repoFalso) Salvar(_ context.Context, b Bases) (time.Time, error) {
	r.b, r.quando = &b, time.Now()
	return r.quando, nil
}

func TestHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := &repoFalso{}
	h := NovoHandler(repo)
	r := gin.New()
	r.GET("/c", h.Buscar)
	r.PUT("/c", h.Salvar)

	pedir := func(metodo string, corpo any) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		if corpo != nil {
			json.NewEncoder(&buf).Encode(corpo)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(metodo, "/c", &buf))
		return w
	}

	w := pedir("GET", nil)
	var resp struct {
		Bases        Bases      `json:"bases"`
		AtualizadoEm *time.Time `json:"atualizado_em"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if w.Code != 200 || resp.Bases.Hora != 35 || resp.AtualizadoEm != nil {
		t.Fatalf("GET inicial: %d %s", w.Code, w.Body)
	}

	b := Padrao()
	b.Hora = 50
	if w := pedir("PUT", b); w.Code != 200 || repo.b.Hora != 50 {
		t.Fatalf("PUT válido: %d %s", w.Code, w.Body)
	}
	b.Hora = 0
	if w := pedir("PUT", b); w.Code != 422 || repo.b.Hora != 50 {
		t.Fatalf("PUT inválido deveria dar 422 e não gravar: %d %s", w.Code, w.Body)
	}
}

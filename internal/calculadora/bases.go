// Package calculadora guarda as bases da calculadora de orçamento: quanto custa o
// material de cada peça, quantas horas leva, o valor da hora do Ricardo, as faixas de
// preço do mercado etc. A conta em si roda no painel (painel/calculadora.js); aqui o
// servidor só guarda e confere esses números.
package calculadora

import (
	"fmt"
	"math"
)

// Servico é uma linha da tabela de preços. MercadoMin/MercadoMax são ponteiros porque
// alguns serviços (esmaecimento) não têm referência de mercado: nil vira null no JSON.
type Servico struct {
	ID         string   `json:"id"`
	Nome       string   `json:"nome"`
	Material   float64  `json:"material"` // R$ para hatch com tinta sólida
	Horas      float64  `json:"horas"`    // horas de trabalho para hatch
	MercadoMin *float64 `json:"mercado_min"`
	MercadoMax *float64 `json:"mercado_max"`
	Max        int      `json:"max,omitempty"`       // quantas peças dessas um carro tem (0 = serviço único)
	Exclusivo  bool     `json:"exclusivo,omitempty"` // pintura completa: não combina com os outros
}

// Fator multiplica material e horas: um SUV dá 30% mais trabalho que um hatch (fator 1,3).
type Fator struct {
	ID    string  `json:"id"`
	Nome  string  `json:"nome"`
	Fator float64 `json:"fator"`
}

// Bases é tudo que a calculadora usa e que dá para mudar na tela "Preços" do painel.
type Bases struct {
	Servicos        []Servico `json:"servicos"`
	Portes          []Fator   `json:"portes"`
	Tintas          []Fator   `json:"tintas"`
	Hora            float64   `json:"hora"`             // valor da hora do Ricardo (R$)
	HorasDia        float64   `json:"horas_dia"`        // horas de trabalho num dia de oficina
	Reserva         float64   `json:"reserva"`          // % para imprevistos
	Troca           bool      `json:"troca"`            // contar a troca de dias com a oficina B
	SugerirCompleta float64   `json:"sugerir_completa"` // % da pintura completa a partir do qual sugere trocar
}

func ptr(v float64) *float64 { return &v }

// Padrao devolve os valores iniciais, os mesmos que o Ricardo aprovou na calculadora antiga.
//
// Conceito Go: é uma função, e não uma variável global, para cada chamada receber uma
// cópia nova. Slices apontam para a mesma memória; se fosse uma variável, quem mexesse
// numa cópia mudaria o padrão de todo mundo.
func Padrao() Bases {
	return Bases{
		Servicos: []Servico{
			{ID: "parachoque", Nome: "Para-choque", Material: 150, Horas: 5, MercadoMin: ptr(350), MercadoMax: ptr(820), Max: 2},
			{ID: "porta", Nome: "Porta", Material: 170, Horas: 6, MercadoMin: ptr(400), MercadoMax: ptr(1020), Max: 4},
			{ID: "paralama", Nome: "Para-lama", Material: 130, Horas: 4.5, MercadoMin: ptr(350), MercadoMax: ptr(710), Max: 4},
			{ID: "capo", Nome: "Capô", Material: 200, Horas: 7, MercadoMin: ptr(600), MercadoMax: ptr(1220)},
			{ID: "tampa", Nome: "Tampa traseira", Material: 180, Horas: 6, MercadoMin: ptr(560), MercadoMax: ptr(1120)},
			{ID: "teto", Nome: "Teto", Material: 250, Horas: 9, MercadoMin: ptr(920), MercadoMax: ptr(1530)},
			{ID: "polimento", Nome: "Polimento completo", Material: 80, Horas: 6, MercadoMin: ptr(250), MercadoMax: ptr(900)},
			{ID: "esmaecimento", Nome: "Esmaecimento em peça vizinha", Material: 60, Horas: 2, Max: 4},
			{ID: "completa", Nome: "Pintura completa", Material: 1300, Horas: 40, MercadoMin: ptr(3470), MercadoMax: ptr(4590), Exclusivo: true},
		},
		Portes: []Fator{
			{ID: "hatch", Nome: "Hatch", Fator: 1},
			{ID: "sedan", Nome: "Sedan", Fator: 1.12},
			{ID: "suv", Nome: "SUV", Fator: 1.3},
			{ID: "picape", Nome: "Picape", Fator: 1.55},
		},
		Tintas: []Fator{
			{ID: "solida", Nome: "Sólida", Fator: 1},
			{ID: "metalica", Nome: "Metálica", Fator: 1.25},
			{ID: "perolizada", Nome: "Perolizada", Fator: 1.4},
		},
		Hora:            35,
		HorasDia:        8,
		Reserva:         10,
		Troca:           true,
		SugerirCompleta: 75,
	}
}

// Mesclar aplica os números salvos sobre o padrão, casando pelo id.
//
// A lista de serviços, portes e tintas (e os nomes) sempre vem do código: o painel só
// muda números. Assim, se um serviço novo entrar no catálogo, ele aparece com o valor
// padrão mesmo que o banco tenha sido salvo antes dele existir, e um id desconhecido
// vindo do navegador é simplesmente ignorado.
func Mesclar(salvas Bases) Bases {
	b := Padrao()
	for i := range b.Servicos {
		s := &b.Servicos[i] // ponteiro: mexe no item da lista, não numa cópia
		for _, x := range salvas.Servicos {
			if x.ID == s.ID {
				s.Material, s.Horas = x.Material, x.Horas
				// serviço sem referência de mercado continua sem; null vindo do navegador não apaga a faixa
				if s.MercadoMin != nil && x.MercadoMin != nil && x.MercadoMax != nil {
					s.MercadoMin, s.MercadoMax = x.MercadoMin, x.MercadoMax
				}
			}
		}
	}
	mesclarFatores(b.Portes, salvas.Portes)
	mesclarFatores(b.Tintas, salvas.Tintas)
	if salvas.Hora != 0 || salvas.HorasDia != 0 { // bases vazias = nada salvo ainda
		b.Hora, b.HorasDia, b.Reserva, b.Troca, b.SugerirCompleta =
			salvas.Hora, salvas.HorasDia, salvas.Reserva, salvas.Troca, salvas.SugerirCompleta
	}
	return b
}

func mesclarFatores(destino, salvos []Fator) {
	for i := range destino {
		for _, x := range salvos {
			if x.ID == destino[i].ID {
				destino[i].Fator = x.Fator
			}
		}
	}
}

// Erros guarda uma mensagem por campo, como no resto da API.
type Erros map[string]string

func (e Erros) Error() string { return fmt.Sprintf("%d campo(s) inválido(s)", len(e)) }

// Validar confere se os números fazem sentido antes de gravar.
func (b Bases) Validar() Erros {
	e := Erros{}
	faixa := func(campo string, v, min, max float64, msg string) {
		if math.IsNaN(v) || v < min || v > max {
			e[campo] = msg
		}
	}
	for _, s := range b.Servicos {
		faixa("material_"+s.ID, s.Material, 0, 50000, s.Nome+": material de R$ 0 a R$ 50.000.")
		faixa("horas_"+s.ID, s.Horas, 0.5, 400, s.Nome+": horas de 0,5 a 400.")
		if s.MercadoMin != nil && s.MercadoMax != nil {
			faixa("mercado_"+s.ID, *s.MercadoMin, 0, 100000, s.Nome+": mercado de R$ 0 a R$ 100.000.")
			faixa("mercado_"+s.ID, *s.MercadoMax, 0, 100000, s.Nome+": mercado de R$ 0 a R$ 100.000.")
			if *s.MercadoMin > *s.MercadoMax {
				e["mercado_"+s.ID] = s.Nome + ": o mínimo do mercado está maior que o máximo."
			}
		}
	}
	for _, f := range append(append([]Fator{}, b.Portes...), b.Tintas...) {
		faixa("fator_"+f.ID, f.Fator, 0.5, 3, f.Nome+": de 50% a menos até 200% a mais.")
	}
	faixa("hora", b.Hora, 1, 1000, "Valor da hora de R$ 1 a R$ 1.000.")
	faixa("horas_dia", b.HorasDia, 1, 14, "Horas por dia de 1 a 14.")
	faixa("reserva", b.Reserva, 0, 60, "Reserva de 0% a 60%.")
	faixa("sugerir_completa", b.SugerirCompleta, 30, 150, "De 30% a 150%.")
	if len(e) == 0 {
		return nil
	}
	return e
}

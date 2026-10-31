// Package pedidos cuida dos pedidos de orçamento: regras, banco e rotas HTTP.
//
// Conceito Go: um pacote por assunto (pedidos), e dentro dele um arquivo por
// papel (modelo, repositório, handler). Quem está fora do pacote só enxerga o
// que começa com letra maiúscula (exportado).
package pedidos

import (
	"fmt"
	"strings"
	"time"
)

// Servico é um item do catálogo. Max = 0 significa serviço único (sem quantidade).
type Servico struct {
	ID        string
	Nome      string
	Max       int
	Exclusivo bool // pintura completa: não combina com os outros
}

// Catalogo espelha web/js/config.js. Se mudar um, mude o outro.
var Catalogo = []Servico{
	{ID: "parachoque", Nome: "Para-choque", Max: 2},
	{ID: "porta", Nome: "Porta", Max: 4},
	{ID: "paralama", Nome: "Para-lama", Max: 4},
	{ID: "capo", Nome: "Capô"},
	{ID: "tampa", Nome: "Tampa traseira"},
	{ID: "teto", Nome: "Teto"},
	{ID: "retoque", Nome: "Retoque de risco", Max: 6},
	{ID: "polimento", Nome: "Polimento completo"},
	{ID: "completa", Nome: "Pintura completa", Exclusivo: true},
}

var Portes = []string{"Hatch", "Sedan", "SUV", "Picape"}

// Status possíveis, na ordem do atendimento (iguais ao enum do banco).
var Status = []string{"novo", "aguardando_fotos", "orcamento_enviado", "agendado", "em_servico", "pronto", "finalizado", "cancelado"}

func servicoPorID(id string) (Servico, bool) {
	for _, s := range Catalogo {
		if s.ID == id {
			return s, true
		}
	}
	return Servico{}, false
}

func StatusValido(s string) bool {
	for _, x := range Status {
		if x == s {
			return true
		}
	}
	return false
}

// Item é um serviço pedido com a quantidade.
type Item struct {
	Servico    string `json:"servico"`
	Quantidade int    `json:"quantidade"`
}

// NovoPedido é o que o site envia. As tags `json:"..."` dizem o nome do campo no JSON.
type NovoPedido struct {
	Itens        []Item `json:"itens"`
	TemAmassado  bool   `json:"tem_amassado"`
	Modelo       string `json:"modelo"`
	Ano          string `json:"ano"`
	Porte        string `json:"porte"`
	Cor          string `json:"cor"`
	TipoPintura  string `json:"tipo_pintura"`
	Observacao   string `json:"observacao"`
	Preferencia  string `json:"preferencia"`
	Nome         string `json:"nome"`
	CidadeBairro string `json:"cidade_bairro"`
	Origem       string `json:"origem"`
	Telefone     string `json:"telefone"` // só no painel: o site não pede telefone
	Site         string `json:"site"`     // armadilha para robôs: campo escondido, pessoa nunca preenche
	ViaPainel    bool   `json:"-"`        // "-": nunca vem do JSON, só o servidor marca
}

// ErrosValidacao guarda um erro por campo, no mesmo formato que o site mostra.
type ErrosValidacao map[string]string

func (e ErrosValidacao) Error() string { return fmt.Sprintf("%d campo(s) inválido(s)", len(e)) }

// Normalizar tira espaços e corta textos longos antes de validar e gravar.
func (p *NovoPedido) Normalizar() {
	limpa := func(s string, max int) string {
		s = strings.Join(strings.Fields(s), " ") // espaços repetidos viram um só
		if r := []rune(s); len(r) > max {
			s = string(r[:max])
		}
		return s
	}
	p.Modelo = limpa(p.Modelo, 40)
	p.Ano = limpa(p.Ano, 4)
	p.Porte = limpa(p.Porte, 20)
	p.Cor = limpa(p.Cor, 30)
	p.TipoPintura = limpa(p.TipoPintura, 30)
	p.Observacao = limpa(p.Observacao, 300)
	p.Preferencia = limpa(p.Preferencia, 40)
	p.Nome = limpa(p.Nome, 60)
	p.CidadeBairro = limpa(p.CidadeBairro, 60)
	p.Origem = limpa(p.Origem, 40)
	p.Telefone = SoDigitos(p.Telefone)
}

// SoDigitos tira tudo que não é número: "(11) 9 9999-8888" vira "11999998888".
func SoDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// TelefoneValido aceita DDD + número (10 ou 11 dígitos), com ou sem o 55 na frente.
func TelefoneValido(t string) bool {
	n := len(t)
	return n == 10 || n == 11 || (strings.HasPrefix(t, "55") && (n == 12 || n == 13))
}

// Validar aplica as mesmas regras do formulário do site. O servidor nunca
// confia só no navegador: qualquer um pode mandar um JSON direto para a API.
func (p NovoPedido) Validar(agora time.Time) ErrosValidacao {
	return p.validar(agora, true)
}

// ValidarPainel é para o pedido que a atendente cadastra à mão (cliente que
// chamou direto no WhatsApp): cidade e bairro viram opcionais e o telefone,
// se vier, precisa ter DDD.
func (p NovoPedido) ValidarPainel(agora time.Time) ErrosValidacao {
	e := p.validar(agora, false)
	if p.Telefone != "" && !TelefoneValido(p.Telefone) {
		if e == nil {
			e = ErrosValidacao{}
		}
		e["telefone"] = "Use DDD + número. Ex.: 11 99999-8888."
	}
	return e
}

func (p NovoPedido) validar(agora time.Time, exigeBairro bool) ErrosValidacao {
	e := ErrosValidacao{}

	if len(p.Itens) == 0 {
		e["itens"] = "Escolha pelo menos um serviço."
	}
	vistos := map[string]bool{}
	temExclusivo := false
	for _, it := range p.Itens {
		s, ok := servicoPorID(it.Servico)
		switch {
		case !ok:
			e["itens"] = "Serviço desconhecido: " + it.Servico
		case vistos[it.Servico]:
			e["itens"] = "Serviço repetido: " + s.Nome
		case s.Max == 0 && it.Quantidade != 1:
			e["itens"] = s.Nome + " não tem quantidade."
		case s.Max > 0 && (it.Quantidade < 1 || it.Quantidade > s.Max):
			e["itens"] = fmt.Sprintf("%s: de 1 a %d.", s.Nome, s.Max)
		}
		vistos[it.Servico] = true
		if s.Exclusivo {
			temExclusivo = true
		}
	}
	if temExclusivo && len(p.Itens) > 1 {
		e["itens"] = "Pintura completa já inclui os outros serviços."
	}

	if len([]rune(p.Modelo)) < 2 {
		e["modelo"] = "Diga o modelo do carro."
	}
	if p.Ano != "" {
		var ano int
		if _, err := fmt.Sscanf(p.Ano, "%4d", &ano); err != nil || len(p.Ano) != 4 || ano < 1950 || ano > agora.Year()+1 {
			e["ano"] = fmt.Sprintf("Use 4 números, entre 1950 e %d. Ou deixe em branco.", agora.Year()+1)
		}
	}
	portaOK := false
	for _, x := range Portes {
		portaOK = portaOK || x == p.Porte
	}
	if !portaOK {
		e["porte"] = "Escolha o tipo de carro."
	}
	if len([]rune(p.Nome)) < 2 {
		e["nome"] = "Diga seu nome."
	}
	if exigeBairro && len([]rune(p.CidadeBairro)) < 3 {
		e["cidade_bairro"] = "Diga sua cidade e bairro."
	}

	if len(e) == 0 {
		return nil
	}
	return e
}

// Criado é a resposta ao site depois de gravar.
type Criado struct {
	Numero   string    `json:"numero"`
	CriadoEm time.Time `json:"criado_em"`
}

// Resumo é uma linha da lista do painel.
type Resumo struct {
	Numero       string    `json:"numero"`
	Status       string    `json:"status"`
	Cliente      string    `json:"cliente"`
	CidadeBairro string    `json:"cidade_bairro"`
	Telefone     string    `json:"telefone,omitempty"`
	Veiculo      string    `json:"veiculo"`
	Itens        []Item    `json:"itens"`
	CriadoEm     time.Time `json:"criado_em"`
	AtualizadoEm time.Time `json:"atualizado_em"` // para mostrar "parado há 3 dias"
	DataAgendada *string   `json:"data_agendada,omitempty"`
}

// Filtro da lista do painel. Abertos = tudo menos finalizado e cancelado.
type Filtro struct {
	Status  string
	Abertos bool
	Limite  int
}

// Dados são os campos que a atendente preenche no pedido. Ponteiro nil = apagar o valor.
type Dados struct {
	Telefone     string  `json:"telefone"`
	ValorOrcado  *int    `json:"valor_orcado_centavos"`
	Sinal        *int    `json:"sinal_centavos"`
	DataAgendada *string `json:"data_agendada"` // "2026-11-07"
}

func (d *Dados) Validar() ErrosValidacao {
	e := ErrosValidacao{}
	d.Telefone = SoDigitos(d.Telefone)
	if d.Telefone != "" && !TelefoneValido(d.Telefone) {
		e["telefone"] = "Use DDD + número. Ex.: 11 99999-8888."
	}
	if d.ValorOrcado != nil && (*d.ValorOrcado < 0 || *d.ValorOrcado > 10_000_000) {
		e["valor_orcado_centavos"] = "Valor fora do esperado."
	}
	if d.Sinal != nil && (*d.Sinal < 0 || (d.ValorOrcado != nil && *d.Sinal > *d.ValorOrcado)) {
		e["sinal_centavos"] = "O sinal não pode ser maior que o valor."
	}
	if d.DataAgendada != nil {
		if *d.DataAgendada == "" {
			d.DataAgendada = nil
		} else if _, err := time.Parse("2006-01-02", *d.DataAgendada); err != nil {
			e["data_agendada"] = "Data inválida."
		}
	}
	if len(e) == 0 {
		return nil
	}
	return e
}

// Evento é uma mudança de status na linha do tempo do pedido.
type Evento struct {
	Status   string    `json:"status"`
	Nota     string    `json:"nota,omitempty"`
	CriadoEm time.Time `json:"criado_em"`
}

// Detalhe é o pedido completo, para a tela do pedido no painel.
type Detalhe struct {
	Resumo
	Ano         *int     `json:"ano,omitempty"` // ponteiro: nil quando o cliente não informou
	Porte       string   `json:"porte"`
	Cor         string   `json:"cor,omitempty"`
	TipoPintura string   `json:"tipo_pintura,omitempty"`
	TemAmassado bool     `json:"tem_amassado"`
	Observacao  string   `json:"observacao,omitempty"`
	Preferencia string   `json:"preferencia,omitempty"`
	Origem      string   `json:"origem,omitempty"`
	ValorOrcado *int     `json:"valor_orcado_centavos,omitempty"`
	Sinal       *int     `json:"sinal_centavos,omitempty"`
	Eventos     []Evento `json:"eventos"`
}

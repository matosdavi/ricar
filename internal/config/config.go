// Package config lê a configuração das variáveis de ambiente.
//
// Conceito Go: senha e endereço do banco nunca ficam no código. Em produção,
// quem roda o servidor define as variáveis; localmente, use o arquivo .env
// (veja .env.exemplo) carregado pelo Makefile.
package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	Porta         string   // PORTA ou PORT (padrão 8080)
	BancoURL      string   // DATABASE_URL
	PainelUsuario string   // PAINEL_USUARIO
	PainelSenha   string   // PAINEL_SENHA
	Origens       []string // CORS_ORIGENS: sites que podem chamar a API, separados por vírgula
	PastaWeb      string   // PASTA_WEB (padrão ./web)
	PastaPainel   string   // PASTA_PAINEL (padrão ./painel)
	SessaoSegredo string   // SESSAO_SEGREDO: texto aleatório longo que assina o login do painel
}

func Carregar() (Config, error) {
	c := Config{
		Porta:         valor("PORTA", valor("PORT", "8080")), // o Render informa a porta em PORT
		BancoURL:      os.Getenv("DATABASE_URL"),
		PainelUsuario: os.Getenv("PAINEL_USUARIO"),
		PainelSenha:   os.Getenv("PAINEL_SENHA"),
		PastaWeb:      valor("PASTA_WEB", "web"),
		PastaPainel:   valor("PASTA_PAINEL", "painel"),
		SessaoSegredo: os.Getenv("SESSAO_SEGREDO"),
	}
	for _, o := range strings.Split(os.Getenv("CORS_ORIGENS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.Origens = append(c.Origens, o)
		}
	}

	// errors.Join junta vários erros num só, para mostrar tudo que falta de uma vez.
	var errs []error
	if c.BancoURL == "" {
		errs = append(errs, errors.New("DATABASE_URL não definida"))
	}
	if c.PainelUsuario == "" || len(c.PainelSenha) < 8 {
		errs = append(errs, errors.New("PAINEL_USUARIO e PAINEL_SENHA (8+ caracteres) são obrigatórios"))
	}
	if len(c.SessaoSegredo) < 32 {
		errs = append(errs, errors.New("SESSAO_SEGREDO precisa de 32+ caracteres (gere com: openssl rand -hex 32)"))
	}
	return c, errors.Join(errs...)
}

func valor(chave, padrao string) string {
	if v := os.Getenv(chave); v != "" {
		return v
	}
	return padrao
}

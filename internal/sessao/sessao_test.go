package sessao

import (
	"strings"
	"testing"
	"time"
)

func TestCookie(t *testing.T) {
	agora := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	s := Nova("mae", "senha-boa-123", strings.Repeat("x", 32))
	s.agora = func() time.Time { return agora }

	v := s.Gerar()
	if !s.Valido(v) {
		t.Fatal("cookie recém-gerado deveria valer")
	}
	if s.Valido(v + "a") {
		t.Fatal("assinatura alterada não pode valer")
	}
	exp, ass, _ := strings.Cut(v, ".")
	if s.Valido(exp + "9." + ass) {
		t.Fatal("validade alterada não pode valer")
	}
	outro := Nova("mae", "senha-boa-123", strings.Repeat("y", 32))
	outro.agora = s.agora
	if outro.Valido(v) {
		t.Fatal("cookie de outro segredo não pode valer")
	}
	s.agora = func() time.Time { return agora.Add(Validade + time.Minute) }
	if s.Valido(v) {
		t.Fatal("cookie vencido não pode valer")
	}
	if !s.confere("mae", "senha-boa-123") || s.confere("mae", "senha-errada") || s.confere("pai", "senha-boa-123") {
		t.Fatal("conferência de usuário e senha errada")
	}
}

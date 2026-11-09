# Barão Pintura Automotiva: contexto do projeto

Site e ferramentas da Barão Pintura Automotiva (antes chamada provisoriamente de RiCar; o pintor é o Ricardo, apelidado de Barão, mais de 40 anos de experiência; atende Embu das Artes, Taboão da Serra e região). O atendimento é feito pela esposa dele, pelo WhatsApp Business +55 11 96859-1162.

Identidade visual: azul (marinho #0A1F3D, azul #1E5AA8, azul vivo #4C9AFF), Barlow Condensed + Source Sans 3, símbolo de coroa com gota de tinta (`web/img/`). Slogan: "Pintura padrão Barão".

- Fase atual: site estático em `web/` (HTML/CSS/JS sem framework, sem build), publicado no GitHub Pages.
- O site gera um recibo de pedido e abre o WhatsApp (`api.whatsapp.com/send`) com o texto. Emojis no recibo chegaram quebrados (�) tanto por `wa.me` quanto por `api.whatsapp.com`: ficam desligados (`CONFIG.emojis`); `?teste-emoji` testa o atalho `whatsapp://` no celular. Ao mudar CSS/JS, troque o `?v=` em `web/index.html`. Não mostra preço ao cliente: o valor só sai depois de avaliar as fotos.
- Textos em português do Brasil, linguagem simples (o público são clientes de oficina de bairro e a família do Ricardo).
- Fase 3 em andamento: backend em Go (Gin, PostgreSQL/pgx) em `cmd/` e `internal/`, servindo `web/`. Já tem API de pedidos e o painel da atendente (`painel/`, só no servidor, nunca no GitHub Pages); falta a hospedagem (gratuita: Render + Neon). Ver docs/fase3.md.
- O catálogo de serviços existe em dois lugares: `web/js/config.js` (o painel também usa este) e `internal/pedidos/modelo.go`. Mudou um, mude o outro.
- O Davi está aprendendo Go: comente conceitos de Go no código quando forem novos, em português.
- A calculadora de preço é ferramenta interna e NÃO deve ir para o site público.

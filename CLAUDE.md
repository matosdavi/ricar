# RiCar: contexto do projeto

Site e ferramentas da RiCar Pintura Automotiva (o pintor é o Ricardo, mais de 30 anos de experiência; atende Embu das Artes, Taboão da Serra e região). O atendimento é feito pela esposa dele, pelo WhatsApp.

- Fase atual: site estático em `web/` (HTML/CSS/JS sem framework, sem build), publicado no GitHub Pages.
- O site gera um recibo de pedido e abre `wa.me` com o texto. Não mostra preço ao cliente: o valor só sai depois de avaliar as fotos.
- Textos em português do Brasil, linguagem simples (o público são clientes de oficina de bairro e a família do Ricardo).
- Fase 3 em andamento: backend em Go (Gin, PostgreSQL/pgx) em `cmd/` e `internal/`, servindo `web/`. Já tem API de pedidos e o painel da atendente (`painel/`, só no servidor, nunca no GitHub Pages); falta a hospedagem (gratuita: Render + Neon). Ver docs/fase3.md.
- O catálogo de serviços existe em dois lugares: `web/js/config.js` (o painel também usa este) e `internal/pedidos/modelo.go`. Mudou um, mude o outro.
- O Davi está aprendendo Go: comente conceitos de Go no código quando forem novos, em português.
- A calculadora de preço é ferramenta interna e NÃO deve ir para o site público.

# RiCar: contexto do projeto

Site e ferramentas da RiCar Pintura Automotiva (o pintor é o Ricardo, mais de 30 anos de experiência; atende Embu das Artes, Taboão da Serra e região). O atendimento é feito pela esposa dele, pelo WhatsApp.

- Fase atual: site estático em `web/` (HTML/CSS/JS sem framework, sem build), publicado no GitHub Pages.
- O site gera um recibo de pedido e abre `wa.me` com o texto. Não mostra preço ao cliente: o valor só sai depois de avaliar as fotos.
- Textos em português do Brasil, linguagem simples (o público são clientes de oficina de bairro e a família do Ricardo).
- Fase 3 planejada: backend em Go (Gin, PostgreSQL/pgx) servindo `web/`, com pedidos, upload de fotos e painel responsivo (celular e PC).
- A calculadora de preço é ferramenta interna e NÃO deve ir para o site público.

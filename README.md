# RiCar Pintura Automotiva

Site de pedido de orçamento da RiCar. O cliente escolhe os serviços, informa o carro e os dados dele, e o site abre o WhatsApp com um recibo pronto para enviar. Depois, o cliente manda as fotos do carro na mesma conversa.

## Estrutura

```
web/              site estático (publicado no GitHub Pages)
  index.html
  css/style.css
  js/config.js    ← número do WhatsApp, serviços e região
  js/app.js       ← formulário, validação e recibo
  img/            ← fotos de antes e depois
.github/workflows/pages.yml   publicação automática a cada push na main
```

## Rodar localmente

Sem build. Abra `web/index.html` no navegador ou sirva a pasta:

```sh
cd web && python3 -m http.server 8080
# http://localhost:8080
```

## Configurar

Tudo que muda com frequência fica em `web/js/config.js`:

- `whatsapp`: número só com dígitos, com DDI e DDD (ex.: `5511999998888`). Enquanto estiver vazio, o site fica em modo protótipo: o botão de envio não abre o WhatsApp e aparece "Copiar pedido (teste)".
- `servicos`: lista de serviços. `max` é quantas dessas peças um carro tem; `exclusivo: true` trava os outros serviços (pintura completa).
- `regiao`: texto da região atendida.

## Publicar

A cada push na `main` que mexe em `web/`, o GitHub Actions publica o site. Configuração única no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Próximas fases

- Fotos de antes e depois em `web/img/`.
- Backend em Go (Gin + PostgreSQL) servindo a mesma pasta `web/`: pedidos gravados com número sequencial, upload das fotos pelo site e painel de atendimento.

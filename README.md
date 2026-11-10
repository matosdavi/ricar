# Barão Pintura Automotiva

Site de pedido de orçamento da RiCar. O cliente escolhe os serviços, informa o carro e os dados dele, e o site abre o WhatsApp com um recibo pronto para enviar. Depois, o cliente manda as fotos do carro na mesma conversa.

## Estrutura

```
web/              site estático (publicado no GitHub Pages)
  img/            símbolo, logos e ícone da marca
  index.html
  css/style.css
  js/config.js    ← número do WhatsApp, serviços e região
  js/app.js       ← formulário, validação e recibo
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
- `api`: endereço do servidor Go (fase 3). Vazio = o site funciona só com o WhatsApp.

## Publicar

A cada push na `main` que mexe em `web/`, o GitHub Actions publica o site. Configuração única no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Servidor (fase 3)

Backend em Go (Gin + PostgreSQL) que grava os pedidos com número sequencial e oferece a API do painel. O site continua funcionando sem ele. Detalhes, rotas e como rodar: [docs/fase3.md](docs/fase3.md).

```
cmd/server/          ponto de entrada
internal/config/     variáveis de ambiente
internal/banco/      conexão e migrações (SQL embutido no binário)
internal/pedidos/    regras, repositório, rotas e testes
internal/calculadora/ bases da calculadora (valores iniciais, validação, rotas)
internal/sessao/     login do painel (cookie assinado)
internal/servidor/   roteador, CORS, limite por IP
painel/              telas do painel: pedidos, calculadora e preços (servidas pelo Go em /painel/)
```

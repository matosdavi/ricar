# Fase 3: servidor da RiCar

Primeira parte do backend: os pedidos do site passam a ser gravados no banco, com número sequencial (RC-00001, RC-00002...), e o painel da atendente tem uma API para listar, ver e mudar o status dos pedidos.

## Como o pedido anda

```
site (web/)  --POST /api/pedidos-->  servidor Go  -->  PostgreSQL
     |                                   |
     |  recebe o número RC-000NN         |
     v                                   |
WhatsApp com o recibo (#RC-000NN)        |
                                         v
painel  --GET/PATCH (usuário e senha)--> pedidos, itens, histórico
```

Se o servidor estiver fora do ar, o site não trava: o pedido segue pelo WhatsApp com um número local, como na fase 2.

## Banco (internal/banco/migracoes/001_inicial.sql)

| Tabela | Para quê |
| --- | --- |
| `clientes` | nome, cidade e bairro, como conheceu; telefone a atendente preenche depois |
| `pedidos` | carro, preferência de data, status, valor orçado, sinal, data agendada (dinheiro em centavos) |
| `pedido_itens` | serviços pedidos e quantidade |
| `pedido_eventos` | histórico de status com nota: a linha do tempo do pedido |
| `pedido_fotos` | pronta para o upload de fotos (próxima etapa) |

Status, na ordem do atendimento: `novo` → `aguardando_fotos` → `orcamento_enviado` → `agendado` → `em_servico` → `pronto` → `finalizado` (ou `cancelado`). São os mesmos das etiquetas do WhatsApp Business.

As migrações rodam sozinhas quando o servidor sobe.

## API

| Rota | Quem usa | O que faz |
| --- | --- | --- |
| `GET /api/saude` | monitoramento | responde `{"ok":true}` |
| `POST /api/pedidos` | site (público) | valida e grava o pedido; devolve `{"numero":"RC-00001"}`. Limite de 10 pedidos por hora por IP e campo-armadilha contra robôs |
| `GET /api/pedidos?status=novo` | painel (senha) | lista os pedidos mais recentes |
| `GET /api/pedidos/RC-00001` | painel (senha) | pedido completo com histórico |
| `PATCH /api/pedidos/RC-00001/status` | painel (senha) | `{"status":"agendado","nota":"sinal pago"}` |

Erros de validação voltam com status 422 e um campo por erro, com as mesmas mensagens do site:
```json
{"erro":"Alguns campos precisam de ajuste.","erros":{"nome":"Diga seu nome."}}
```

## Rodar localmente

```sh
cp .env.exemplo .env
make deps      # primeira vez
make banco     # PostgreSQL no Docker
make rodar     # http://localhost:8080 (site + API)
make testar
```

Para o site falar com o servidor, ponha o endereço em `web/js/config.js` → `api`.

## Próximos passos

1. **Painel da atendente** (tela responsiva, celular e PC): lista por status, detalhe do pedido, botões para avançar o status, valor e sinal.
2. **Upload de fotos** no site, com link das fotos no recibo.
3. **Hospedagem** do servidor e do banco. Opções a decidir: Fly.io, Render, Railway ou uma VPS; todas rodam o `Dockerfile`.
4. Login de verdade (sessão) no lugar do usuário e senha do navegador, se mais gente for usar o painel.

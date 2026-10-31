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

## Painel da atendente (`painel/`, em /painel/)

Feito para o celular e responsivo no PC. Só existe no servidor Go: o GitHub Pages publica apenas `web/`.

- **Login próprio:** usuário e senha do `.env`. O aparelho fica conectado por 30 dias (cookie assinado com `SESSAO_SEGREDO`, protegido contra uso por outros sites).
- **Lista por etapa:** filtros no topo com a contagem de cada etapa. Os pedidos parados há mais tempo aparecem primeiro, e um selo amarelo avisa quando a bola está com a gente há 2 dias ou mais.
- **Pedido:** botão grande para mover à próxima etapa (com anotação opcional), botão para abrir a conversa no WhatsApp, valor, sinal ("usar 50%"), data agendada, telefone e o histórico.
- **Novo pedido:** cadastro manual para quem chamou direto no WhatsApp (a maioria dos clientes). Só nome, carro e um serviço são obrigatórios.
- Dá para adicionar à tela inicial do celular como um app (Compartilhar → Adicionar à Tela de Início).

## API

| Rota | Quem usa | O que faz |
| --- | --- | --- |
| `GET /api/saude` | monitoramento | responde `{"ok":true}` |
| `POST /api/pedidos` | site (público) | valida e grava o pedido; devolve `{"numero":"RC-00001"}`. Limite de 10 pedidos por hora por IP e campo-armadilha contra robôs |
| `POST /api/sessao` · `DELETE /api/sessao` | painel | entrar (`{"usuario","senha"}`, 10 tentativas a cada 15 min por IP) e sair |
| `GET /api/painel/pedidos?abertos=1` ou `?status=finalizado` | painel (logado) | lista |
| `POST /api/painel/pedidos` | painel (logado) | cadastro manual (bairro opcional, telefone opcional) |
| `GET /api/painel/pedidos/RC-00001` | painel (logado) | pedido completo com histórico |
| `PATCH /api/painel/pedidos/RC-00001` | painel (logado) | `{"telefone","valor_orcado_centavos","sinal_centavos","data_agendada"}` |
| `PATCH /api/painel/pedidos/RC-00001/status` | painel (logado) | `{"status":"agendado","nota":"sinal pago"}` |

Erros de validação voltam com status 422 e um campo por erro, com as mesmas mensagens do site:
```json
{"erro":"Alguns campos precisam de ajuste.","erros":{"nome":"Diga seu nome."}}
```

## Rodar localmente

```sh
cp .env.exemplo .env
make deps      # primeira vez
make banco     # PostgreSQL no Docker
make rodar     # http://localhost:8080 (site + API) e http://localhost:8080/painel/
make testar
```

Para o site falar com o servidor, ponha o endereço em `web/js/config.js` → `api`.

## Próximos passos

1. **Hospedagem gratuita:** servidor no Render (plano grátis) e banco no Neon (plano grátis), ambos rodando o `Dockerfile` / `DATABASE_URL`.
2. **Fotos de antes e depois** do site em `web/img/` (poucas e fixas, não precisam de armazenamento extra).
3. Upload das fotos dos clientes pelo site, se fizer falta (hoje elas chegam pelo WhatsApp).

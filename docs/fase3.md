# Fase 3: servidor da RiCar

Primeira parte do backend: os pedidos do site passam a ser gravados no banco, com número sequencial (BP-00001, BP-00002...), e o painel da atendente tem uma API para listar, ver e mudar o status dos pedidos.

## Como o pedido anda

```
site (web/)  --POST /api/pedidos-->  servidor Go  -->  PostgreSQL
     |                                   |
     |  recebe o número BP-000NN         |
     v                                   |
WhatsApp com o recibo (#BP-000NN)        |
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
| `calculadora` | as bases da calculadora (preços, horas, valor da hora...) numa linha só, em JSON (migração 004) |

`pedidos.orcamento` (JSON) guarda a "foto" do cálculo salvo no pedido: o que foi marcado, as partes do preço e a mensagem. Mudar os preços depois não altera um orçamento já salvo.

Status, na ordem do atendimento: `novo` → `aguardando_fotos` → `orcamento_enviado` → `agendado` → `em_servico` → `pronto` → `finalizado` (ou `cancelado`). São os mesmos das etiquetas do WhatsApp Business.

As migrações rodam sozinhas quando o servidor sobe.

## Painel da atendente (`painel/`, em /painel/)

Feito para o celular e responsivo no PC. Só existe no servidor Go: o GitHub Pages publica apenas `web/`.

- **Login próprio:** usuário e senha do `.env`. O aparelho fica conectado por 30 dias (cookie assinado com `SESSAO_SEGREDO`, protegido contra uso por outros sites).
- **Lista por etapa:** filtros no topo com a contagem de cada etapa. Os pedidos parados há mais tempo aparecem primeiro, e um selo amarelo avisa quando a bola está com a gente há 2 dias ou mais.
- **Pedido:** botão grande para mover à próxima etapa (com anotação opcional), botão para abrir a conversa no WhatsApp, valor, sinal ("usar 50%"), data agendada, telefone e o histórico.
- **Orçamento no pedido:** botão "Calcular orçamento" abre a calculadora com os serviços, o porte e a tinta do pedido já marcados. "Salvar no pedido" grava o cálculo, o valor e o sinal (50%) e anota no histórico; "Salvar e enviar no WhatsApp" também abre a conversa com a mensagem pronta e, se o pedido estava em "Novo" ou "Aguardando fotos", já o move para "Orçamento enviado" (o botão "Enviar no WhatsApp" do pedido faz o mesmo). "Refazer cálculo" volta exatamente ao que foi salvo.
- **Calculadora avulsa (aba Calculadora):** a mesma conta, fora de qualquer pedido. Nada é salvo; lembra o que foi marcado enquanto o painel está aberto. "Criar pedido com este orçamento" abre o cadastro já com os serviços, o porte e a tinta marcados e salva o orçamento no pedido novo.
- **Resumo (aba Resumo):** por mês, quantos pedidos chegaram, quantos receberam orçamento, quantos fecharam (agendado ou depois) e a taxa, cancelados, valor fechado, sinais, carros entregues e o valor deles, serviços mais pedidos e como os clientes conheceram.
- **Preços (aba Preços):** muda a base da calculadora: material, horas e faixa de mercado de cada serviço, valor da hora, horas por dia, reserva, troca da oficina B, % a mais por porte e tinta, e quando sugerir a pintura completa. Mostra o valor padrão ao lado do que foi mudado e tem "Voltar aos valores iniciais". A conta fica em `painel/calculadora.js`; os valores iniciais, em `internal/calculadora/bases.go`.
- **Novo pedido:** cadastro manual para quem chamou direto no WhatsApp (a maioria dos clientes). Só nome, carro e um serviço são obrigatórios.
- Dá para adicionar à tela inicial do celular como um app (Compartilhar → Adicionar à Tela de Início).

## API

| Rota | Quem usa | O que faz |
| --- | --- | --- |
| `GET /api/saude` | monitoramento | responde `{"ok":true}` |
| `POST /api/pedidos` | site (público) | valida e grava o pedido; devolve `{"numero":"BP-00001"}`. Limite de 10 pedidos por hora por IP e campo-armadilha contra robôs |
| `POST /api/sessao` · `DELETE /api/sessao` | painel | entrar (`{"usuario","senha"}`, 10 tentativas a cada 15 min por IP) e sair |
| `GET /api/painel/pedidos?abertos=1` ou `?status=finalizado` | painel (logado) | lista |
| `POST /api/painel/pedidos` | painel (logado) | cadastro manual (bairro opcional, telefone opcional) |
| `GET /api/painel/pedidos/BP-00001` | painel (logado) | pedido completo com histórico |
| `PATCH /api/painel/pedidos/BP-00001` | painel (logado) | `{"telefone","valor_orcado_centavos","sinal_centavos","data_agendada"}` |
| `PATCH /api/painel/pedidos/BP-00001/status` | painel (logado) | `{"status":"agendado","nota":"sinal pago"}` |
| `PUT /api/painel/pedidos/BP-00001/orcamento` | painel (logado) | `{"calculo":{...},"valor_orcado_centavos","sinal_centavos","enviado"}`: grava o cálculo da calculadora; com `enviado:true`, move de Novo/Aguardando fotos para Orçamento enviado |
| `GET /api/painel/resumo?mes=2026-11` | painel (logado) | números do mês (sem `mes` = mês atual, horário de Brasília) |
| `GET /api/painel/calculadora` | painel (logado) | bases atuais, valores padrão e data da última alteração |
| `PUT /api/painel/calculadora` | painel (logado) | salva as bases (só números; serviços, portes e tintas vêm do código) |

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

1. **Fotos de antes e depois** do site em `web/img/` (poucas e fixas, não precisam de armazenamento extra).
2. Upload das fotos dos clientes pelo site, se fizer falta (hoje elas chegam pelo WhatsApp).

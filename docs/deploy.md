# Colocar o servidor no ar (Render + Neon, plano grátis)

O site público continua no GitHub Pages. No Render roda o servidor Go, que serve a API, o painel (`/painel/`) e uma cópia do site.

## 1. Banco no Neon

1. Crie um projeto novo (ex.: `barao`), região mais próxima do Brasil disponível.
2. Em **Connection details**, copie a string de conexão **direta** (sem `-pooler` no endereço). O pgx usa comandos preparados, que podem dar problema no modo pooler.
3. Ela tem este formato: `postgresql://usuario:senha@ep-xxxx.região.aws.neon.tech/neondb?sslmode=require`

As tabelas são criadas sozinhas quando o servidor sobe (migrações embutidas).

## 2. Servidor no Render

1. **New → Web Service → Build and deploy from a Git repository →** `matosdavi/ricar`.
2. **Runtime:** Docker (o Render usa o `Dockerfile` da raiz). **Instance type:** Free.
3. **Health check path:** `/api/saude`.
4. **Environment variables:**

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | a string direta do Neon |
| `PAINEL_USUARIO` | o usuário da atendente (ex.: `mae`) |
| `PAINEL_SENHA` | senha forte, 8+ caracteres |
| `SESSAO_SEGREDO` | resultado de `openssl rand -hex 32` |
| `CORS_ORIGENS` | o endereço do site público (ex.: `https://matosdavi.github.io` e, depois, `https://baraopintura.com.br`), separados por vírgula |

A porta vem sozinha do Render (variável `PORT`).

5. Depois do primeiro deploy, confira `https://<seu-servico>.onrender.com/api/saude` → `{"ok":true}` e abra `/painel/`.

## 3. Ligar o site ao servidor

Em `web/js/config.js`, preencha `api` com o endereço do Render (ex.: `https://barao.onrender.com`) e troque o `?v=` em `web/index.html`. A partir daí os pedidos do site ganham número sequencial (BP-00001) e aparecem no painel.

## Bom saber (plano grátis)

- O serviço "dorme" depois de um tempo sem uso; o primeiro acesso leva alguns segundos para acordar. Se o servidor não responder a tempo, o site manda o pedido pelo WhatsApp do mesmo jeito.
- Com domínio próprio, dá para usar `painel.seudominio.com.br` no Render (Settings → Custom Domains).

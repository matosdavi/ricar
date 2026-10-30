-- Estrutura inicial: clientes, pedidos, serviços do pedido, histórico de status e fotos.
-- Valores em dinheiro ficam em centavos (inteiro) para não ter erro de arredondamento.

CREATE TYPE status_pedido AS ENUM (
    'novo',               -- chegou pelo site, ainda ninguém olhou
    'aguardando_fotos',   -- cliente ainda não mandou as fotos
    'orcamento_enviado',  -- valor enviado, esperando resposta
    'agendado',           -- sinal pago, data marcada
    'em_servico',         -- carro na oficina
    'pronto',             -- pronto para retirar
    'finalizado',         -- entregue e pago
    'cancelado'
);

CREATE SEQUENCE pedido_numero_seq START 1;

CREATE TABLE clientes (
    id             BIGSERIAL PRIMARY KEY,
    nome           TEXT NOT NULL,
    telefone       TEXT,            -- preenchido pela atendente (o site não pede)
    cidade_bairro  TEXT,
    origem         TEXT,            -- como conheceu (opcional)
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pedidos (
    id                   BIGSERIAL PRIMARY KEY,
    numero               TEXT NOT NULL UNIQUE
                         DEFAULT ('RC-' || lpad(nextval('pedido_numero_seq')::TEXT, 5, '0')),
    cliente_id           BIGINT NOT NULL REFERENCES clientes(id),
    status               status_pedido NOT NULL DEFAULT 'novo',

    veiculo_modelo       TEXT NOT NULL,
    veiculo_ano          SMALLINT,
    veiculo_porte        TEXT NOT NULL,
    veiculo_cor          TEXT,
    tipo_pintura         TEXT,
    tem_amassado         BOOLEAN NOT NULL DEFAULT false,
    observacao           TEXT,
    preferencia_data     TEXT,

    -- preenchidos depois, no painel
    valor_orcado_centavos  INTEGER CHECK (valor_orcado_centavos >= 0),
    sinal_centavos         INTEGER CHECK (sinal_centavos >= 0),
    data_agendada          DATE,

    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pedidos_status_idx ON pedidos (status, criado_em DESC);

CREATE TABLE pedido_itens (
    id          BIGSERIAL PRIMARY KEY,
    pedido_id   BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    servico     TEXT NOT NULL,      -- id do catálogo: parachoque, porta, completa...
    quantidade  SMALLINT NOT NULL CHECK (quantidade > 0)
);
CREATE INDEX pedido_itens_pedido_idx ON pedido_itens (pedido_id);

-- Toda mudança de status fica registrada: quem olha o pedido vê a linha do tempo.
CREATE TABLE pedido_eventos (
    id          BIGSERIAL PRIMARY KEY,
    pedido_id   BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    status      status_pedido NOT NULL,
    nota        TEXT,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pedido_eventos_pedido_idx ON pedido_eventos (pedido_id, criado_em);

-- Pronta para o upload de fotos (próxima etapa).
CREATE TABLE pedido_fotos (
    id          BIGSERIAL PRIMARY KEY,
    pedido_id   BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    tipo        TEXT NOT NULL CHECK (tipo IN
                ('carro_inteiro', 'avaria_perto', 'avaria_longe', 'entrada', 'antes', 'depois', 'outra')),
    caminho     TEXT NOT NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pedido_fotos_pedido_idx ON pedido_fotos (pedido_id);

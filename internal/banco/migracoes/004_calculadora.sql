-- Calculadora no painel.
--
-- calculadora: as bases (preço do material, horas de cada peça, valor da hora, faixas de
-- mercado...) num registro só, em JSON. Uma linha só (id = 1): é a "tabela de preços" da Barão.
CREATE TABLE calculadora (
    id             SMALLINT PRIMARY KEY CHECK (id = 1),
    bases          JSONB NOT NULL,
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- orcamento: a "foto" do cálculo feito para o pedido (serviços marcados, porte, tinta,
-- desconto, valores de cada parte). Se as bases mudarem depois, o orçamento já enviado
-- ao cliente continua igual.
ALTER TABLE pedidos ADD COLUMN orcamento JSONB;

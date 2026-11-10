-- Código que o site mostrou no recibo do WhatsApp (ex.: BP1011-4821).
-- Normalmente o recibo já sai com o número BP-000NN; a referência ajuda a achar o pedido
-- quando o servidor demorou a responder e o recibo saiu com o código local.
ALTER TABLE pedidos ADD COLUMN referencia TEXT;
CREATE INDEX pedidos_referencia_idx ON pedidos (referencia);

-- Novos pedidos passam a ser numerados BP-00001 (Barão Pintura), em vez de RC- (RiCar).
-- A sequência continua a mesma; pedidos antigos mantêm o número que já tinham.
ALTER TABLE pedidos
    ALTER COLUMN numero SET DEFAULT ('BP-' || lpad(nextval('pedido_numero_seq')::TEXT, 5, '0'));

/* ===== CONFIGURAÇÃO: troque aqui quando tiver os dados ===== */
window.CONFIG = {
  nome: 'Barão Pintura Automotiva',
  whatsapp: '5511968591162',  // só números, com DDI e DDD. Ex.: '5511999998888'
  emojis: true,               // emojis no recibo, só no celular (abre o app direto). Se quebrarem, troque para false
  api: 'https://ricar-yr2o.onrender.com', // endereço do servidor Go (fase 3). Vazio = sem servidor, só WhatsApp. Ex.: 'https://api.ricar.com.br'
  regiao: 'Embu das Artes, Taboão da Serra e região',
  // max = quantas dessas peças um carro tem; sem max = serviço único; exclusivo = trava os outros
  servicos: [
    {id:'parachoque', nome:'Para-choque',        max:2},
    {id:'porta',      nome:'Porta',              max:4},
    {id:'paralama',   nome:'Para-lama',          max:4},
    {id:'capo',       nome:'Capô'},
    {id:'tampa',      nome:'Tampa traseira'},
    {id:'teto',       nome:'Teto'},
    {id:'polimento',  nome:'Polimento completo'},
    {id:'completa',   nome:'Pintura completa',   exclusivo:true}
  ],
  portes: ['Hatch','Sedan','SUV','Picape']
};
/* =========================================================== */

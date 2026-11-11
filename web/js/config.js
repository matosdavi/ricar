/* ===== CONFIGURAÇÃO: troque aqui quando tiver os dados ===== */
window.CONFIG = {
  nome: 'Barão Pintura Automotiva',
  whatsapp: '5511968591162',  // só números, com DDI e DDD. Ex.: '5511999998888'
  emojis: true,               // emojis no recibo (celular: app direto; computador: WhatsApp Web). Se quebrarem, troque para false
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
  portes: ['Hatch','Sedan','SUV','Picape'],
  // foto do Ricardo na seção "Quem é o Barão". Vazio = a seção aparece só com o texto. Ex.: 'img/barao.jpg'
  fotoSobre: '',
  // antes e depois: a seção só aparece quando tiver pelo menos um. Ex.:
  // {antes:'img/trabalhos/1-antes.jpg', depois:'img/trabalhos/1-depois.jpg', legenda:'Para-choque de um Onix prata'}
  trabalhos: []
};
/* =========================================================== */

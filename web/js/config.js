/* ===== CONFIGURAÇÃO: troque aqui quando tiver os dados ===== */
window.CONFIG = {
  nome: 'RiCar Pintura Automotiva',
  whatsapp: '',               // só números, com DDI e DDD. Ex.: '5511999998888'
  regiao: 'Embu das Artes, Taboão da Serra e região',
  // max = quantas dessas peças um carro tem; sem max = serviço único; exclusivo = trava os outros
  servicos: [
    {id:'parachoque', nome:'Para-choque',        max:2},
    {id:'porta',      nome:'Porta',              max:4},
    {id:'paralama',   nome:'Para-lama',          max:4},
    {id:'capo',       nome:'Capô'},
    {id:'tampa',      nome:'Tampa traseira'},
    {id:'teto',       nome:'Teto'},
    {id:'retoque',    nome:'Retoque de risco',   max:6},
    {id:'polimento',  nome:'Polimento completo'},
    {id:'completa',   nome:'Pintura completa',   exclusivo:true}
  ],
  portes: ['Hatch','Sedan','SUV','Picape']
};
/* =========================================================== */

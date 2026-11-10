/* Conta da calculadora Barão (a mesma da calculadora antiga, agora com as bases vindas do servidor).
   Só a conta: sem tela. As telas ficam em painel.js.

   bases: o que vem de GET /api/painel/calculadora (servicos, portes, tintas, hora, horas_dia,
          reserva, troca, sugerir_completa)
   sel:   o que foi marcado {itens:[{id,q}], porte, tinta, desc, fun, hora, horas_dia, reserva, troca} */
(function(raiz){
  'use strict';
  var PECAS=['parachoque','porta','paralama','capo','tampa','teto']; // peças que pedem esmaecimento em cor metálica
  function round10(v){ return Math.round(v/10)*10; }
  function limitar(v,min,max,padrao){ v=+v; if(!isFinite(v)) v=padrao; return Math.max(min,Math.min(max,v)); }
  function achar(lista,id){ return lista.find(function(x){return x.id===id}) || lista[0]; }

  // Seleção padrão a partir das bases (nada marcado, hatch, sólida, custos da tabela de preços).
  function selecaoInicial(b){
    return {itens:[], porte:b.portes[0].id, tinta:b.tintas[0].id, desc:0, fun:0,
      hora:b.hora, horas_dia:b.horas_dia, reserva:b.reserva, troca:b.troca};
  }

  // Limpa a seleção: tira serviços que não existem, acerta quantidades e a regra da pintura completa.
  function normalizar(b, sel){
    var vistos={}, itens=[];
    (sel.itens||[]).forEach(function(it){
      var s=b.servicos.find(function(x){return x.id===it.id});
      if(!s || vistos[s.id]) return; vistos[s.id]=true;
      itens.push({id:s.id, q:s.max?Math.round(limitar(it.q,1,s.max,1)):1});
    });
    var completa=itens.find(function(it){ return achar(b.servicos,it.id).exclusivo; });
    if(completa) itens=[completa];
    return {itens:itens, porte:achar(b.portes,sel.porte).id, tinta:achar(b.tintas,sel.tinta).id,
      desc:limitar(sel.desc,0,30,0), fun:limitar(sel.fun,0,50000,0),
      hora:limitar(sel.hora,0,1000,b.hora), horas_dia:limitar(sel.horas_dia,1,14,b.horas_dia),
      reserva:limitar(sel.reserva,0,60,b.reserva), troca:sel.troca!==false};
  }

  function custos(itens,P,T,c){
    var horas=0,material=0,lo=0,hi=0;
    itens.forEach(function(i){
      horas+=i.s.horas*P*i.q; material+=i.s.material*P*T*i.q;
      if(i.s.mercado_min!=null){ lo+=i.s.mercado_min*P*T*i.q; hi+=i.s.mercado_max*P*T*i.q; }
    });
    var mao=horas*c.hora, espaco=c.troca?horas*c.hora:0, base=material+mao+espaco, reserva=base*c.reserva;
    return {horas:horas,material:material,lo:lo,hi:hi,mao:mao,espaco:espaco,base:base,reserva:reserva,bruto:base+reserva};
  }

  function calcular(b, selBruta){
    var sel=normalizar(b, selBruta);
    var porte=achar(b.portes,sel.porte), tinta=achar(b.tintas,sel.tinta);
    var P=porte.fator, T=tinta.fator, c={hora:sel.hora, reserva:sel.reserva/100, troca:sel.troca};
    var desc=sel.desc/100, fun=sel.fun;
    var itens=sel.itens.map(function(it){ var s=achar(b.servicos,it.id); return {s:s,q:it.q,nome:s.nome}; });
    var r={sel:sel, porte:porte, tinta:tinta, itens:itens, vazio:!itens.length};
    if(r.vazio) return r;

    var k=custos(itens,P,T,c);
    var pintura=round10(k.bruto*(1-desc));
    r.k=k; r.pintura=pintura; r.fun=fun; r.total=pintura+fun;
    r.desconto=k.bruto-pintura; // positivo com desconto (pode ter centavos de arredondamento)

    // tempo: ele usa sábado e domingo no cliente e paga a troca depois, então a troca não atrasa a entrega
    var diasProprios=k.horas/sel.horas_dia;
    r.semanas=Math.max(1,Math.ceil(diasProprios/2-1e-9));
    r.diasTroca=sel.troca?Math.max(1,Math.ceil(diasProprios-1e-9)):0;
    var horasTot=k.horas*(sel.troca?2:1);
    r.sobraHora=horasTot>0?(pintura-k.material)/horasTot:0;
    r.sinal=round10(r.total/2);

    // muitas peças -> sugerir pintura completa
    var temCompleta=itens.some(function(i){return i.s.exclusivo});
    var comp=b.servicos.find(function(s){return s.exclusivo});
    if(!temCompleta && comp){
      var precoComp=round10(custos([{s:comp,q:1}],P,T,c).bruto*(1-desc));
      if(pintura>=precoComp*(b.sugerir_completa/100)) r.sugerirCompleta={preco:precoComp, pct:Math.round(pintura/precoComp*100)};
    }
    // cor metálica/perolizada em peça costuma pedir esmaecimento na vizinha
    var temPeca=itens.some(function(i){return PECAS.indexOf(i.s.id)>=0});
    var temEsm=itens.some(function(i){return i.s.id==='esmaecimento'});
    r.sugerirEsmaecimento = tinta.id!=='solida' && temPeca && !temEsm && b.servicos.some(function(s){return s.id==='esmaecimento'});
    // desconto que derruba o preço abaixo do custo
    r.abaixoDoCusto = pintura<k.base;

    // comparação com o mercado (só a pintura; funilaria e serviços sem referência ficam de fora)
    var ref=itens.filter(function(i){return i.s.mercado_min!=null});
    if(ref.length){
      var pRef=ref.length===itens.length?pintura:round10(custos(ref,P,T,c).bruto*(1-desc));
      var lo=k.lo, hi=k.hi, nivel, texto;
      if(pRef<lo){ nivel='baixo'; texto='Abaixo do mercado. Ele pode cobrar mais por este serviço.'; }
      else if(pRef>hi){ nivel='alto'; texto='Acima da faixa de mercado. Confira as horas e o material, ou justifique pela qualidade.'; }
      else { var pct=hi>lo?(pRef-lo)/(hi-lo):0.5; nivel='ok'; texto=pct<0.35?'Dentro do mercado, na parte de baixo da faixa.':pct>0.7?'Dentro do mercado, na parte de cima da faixa.':'Dentro do mercado, no meio da faixa.'; }
      r.mercado={lo:lo, hi:hi, preco:pRef, parcial:pRef!==pintura, nivel:nivel, texto:texto};
    }
    return r;
  }

  function brl(v){ return 'R$ '+Math.round(v).toLocaleString('pt-BR'); }
  function horasTxt(h){ return h.toLocaleString('pt-BR',{maximumFractionDigits:1}); }
  function listaTxt(r){ return r.itens.map(function(i){return (i.q>1?i.q+' × ':'')+i.nome}).join(' + '); }
  function resumo(r){
    return listaTxt(r)+' · '+r.porte.nome+' · '+r.tinta.nome+(r.sel.desc>0?' · '+r.sel.desc+'% de desconto':'')+(r.fun>0?' · com funilaria':'');
  }

  // Texto para o cliente. Sem emojis: o link do WhatsApp (wa.me) estraga emojis.
  // ctx (opcional): {nome, veiculo, numero}
  function mensagem(r, ctx){
    if(r.vazio) return '';
    ctx=ctx||{};
    var primeiro=(ctx.nome||'').trim().split(' ')[0];
    var prazo=r.semanas===1?'até 1 semana':'até '+r.semanas+' semanas';
    var l=[];
    l.push(primeiro?'Olá, '+primeiro+'! Segue o orçamento'+(ctx.veiculo?' do seu '+ctx.veiculo:'')+(ctx.numero?' (pedido '+ctx.numero+')':'')+':':'Segue seu orçamento:');
    l.push(''); l.push('Serviços (pintura '+r.tinta.nome.toLowerCase()+'):');
    r.itens.forEach(function(i){ l.push('- '+(i.q>1?i.q+' × ':'')+i.nome); });
    if(r.fun>0){ l.push('- Funilaria'); l.push(''); l.push('Pintura: '+brl(r.pintura)); l.push('Funilaria: '+brl(r.fun)); l.push('Total: '+brl(r.total)); }
    else { l.push(''); l.push('Valor: '+brl(r.total)); }
    l.push('Prazo: '+prazo);
    l.push('Pagamento: sinal de '+brl(r.sinal)+' no Pix para compra do material e o restante na entrega.');
    l.push(''); l.push('Podemos agendar?');
    return l.join('\n');
  }

  // "Foto" do cálculo que vai para o pedido (PUT /api/painel/pedidos/:numero/orcamento).
  function foto(r, msg, basesEm){
    var k=r.k;
    return {versao:1, sel:r.sel, resumo:resumo(r), mensagem:msg, calculado_em:new Date().toISOString(), bases_em:basesEm||null,
      resultado:{total:r.total, pintura:r.pintura, funilaria:r.fun, sinal:r.sinal, semanas:r.semanas, dias_troca:r.diasTroca,
        horas:Math.round(k.horas*10)/10, material:Math.round(k.material), mao_de_obra:Math.round(k.mao),
        troca_oficina:Math.round(k.espaco), reserva:Math.round(k.reserva), desconto:Math.round(Math.max(0,r.desconto))}};
  }

  var api={selecaoInicial:selecaoInicial, normalizar:normalizar, calcular:calcular, mensagem:mensagem, foto:foto,
    resumo:resumo, brl:brl, horasTxt:horasTxt};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else raiz.CalcBarao=api;
})(this);

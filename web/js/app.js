/* Página de pedido de orçamento: monta o recibo e abre o WhatsApp com o texto pronto. Configuração em config.js. */
(function(){
  var CONFIG=window.CONFIG;
  var $=function(id){return document.getElementById(id)};
  var pad=function(n){return String(n).padStart(2,'0')};
  var now=new Date(), anoMax=now.getFullYear()+1;

  // número do pedido: dia+mês + 4 dígitos (vira sequencial quando houver servidor)
  var pedidoNo='RC'+pad(now.getDate())+pad(now.getMonth()+1)+'-'+String(Math.floor(1000+Math.random()*9000));
  var quando=pad(now.getDate())+'/'+pad(now.getMonth()+1)+'/'+now.getFullYear()+' - '+pad(now.getHours())+':'+pad(now.getMinutes());

  // serviços
  CONFIG.servicos.forEach(function(s){
    var l=document.createElement('label'); l.className='svc'; l.id='row-'+s.id;
    l.innerHTML='<input type="checkbox" id="s-'+s.id+'" value="'+s.id+'"><b>'+s.nome+'</b><small id="p-'+s.id+'"></small>'+
      (s.max?'<span class="qty"><span class="hint">Quantas?</span><input type="number" id="q-'+s.id+'" min="1" max="'+s.max+'" value="1" aria-label="Quantidade de '+s.nome+' (até '+s.max+')"></span>':'');
    $('svcs').appendChild(l);
  });
  CONFIG.portes.forEach(function(p,i){
    var l=document.createElement('label'); l.className='chip';
    l.innerHTML='<input type="radio" name="porte" id="pt-'+i+'" value="'+p+'"'+(i===0?' checked':'')+'><span>'+p+'</span>';
    $('porte').appendChild(l);
  });
  var sat=new Date(now); sat.setHours(0,0,0,0); sat.setDate(sat.getDate()+((6-sat.getDay()+7)%7||7));
  var datas=[];
  for(var i=0;i<4;i++){var a=new Date(sat);a.setDate(sat.getDate()+7*i);var b=new Date(a);b.setDate(a.getDate()+1);
    datas.push('Sáb '+pad(a.getDate())+'/'+pad(a.getMonth()+1)+' e dom '+pad(b.getDate())+'/'+pad(b.getMonth()+1));}
  datas.push('O quanto antes');
  datas.forEach(function(d,i){
    var l=document.createElement('label'); l.className='chip';
    l.innerHTML='<input type="radio" name="data" id="dt-'+i+'" value="'+d+'"'+(i===datas.length-1?' checked':'')+'><span>'+d+'</span>';
    $('datas').appendChild(l);
  });

  /* regras: pintura completa trava o resto; quantidade dentro do limite do carro */
  function regras(){
    var comp=$('s-completa').checked;
    CONFIG.servicos.forEach(function(s){
      if(s.exclusivo) return;
      var c=$('s-'+s.id); if(comp&&c.checked) c.checked=false;
      c.disabled=comp; $('row-'+s.id).classList.toggle('off',comp);
      $('p-'+s.id).textContent=comp?'Já incluído na pintura completa':'';
    });
  }
  function qtd(s){var q=$('q-'+s.id); if(!q) return 1; var v=Math.round(+q.value); if(!isFinite(v)||v<1) v=1; if(v>s.max) v=s.max; return v;}
  function fixQtd(e){ // corrige o número só quando a pessoa sai do campo, para não brigar com a digitação
    var s=CONFIG.servicos.find(function(x){return e.target.id==='q-'+x.id}); if(!s) return;
    var v=qtd(s); if(String(v)!==e.target.value){ e.target.value=v; $('status').textContent=s.max&&+e.target.value===s.max?'Um carro tem no máximo '+s.max+' '+s.nome.toLowerCase()+(s.max>1?'s':'')+'.':''; }
  }

  function dados(){
    var itens=[];
    CONFIG.servicos.forEach(function(s){ if($('s-'+s.id).checked) itens.push({id:s.id,nome:s.nome,q:qtd(s)}); });
    var porte=document.querySelector('input[name=porte]:checked'), data=document.querySelector('input[name=data]:checked');
    var tinta=$('tinta');
    return {itens:itens, porte:porte?porte.value:'', tinta:tinta.value==='nao-sei'?'':tinta.selectedOptions[0].textContent.replace(/ \(.*\)/,''),
      modelo:$('modelo').value.trim(), ano:$('ano').value.trim(), cor:$('cor').value.trim(), obs:$('obs').value.trim().replace(/\s+/g,' '),
      amassado:$('amassado').checked, data:data?data.value:'', nome:$('nome').value.trim(), bairro:$('bairro').value.trim(), origem:$('origem').value, fotos:$('fotos-ok').checked};
  }

  // recibo: só mostra o que foi preenchido (nada de "[modelo]" no texto)
  function texto(d){
    var L=[], sep='-----------------------------';
    L.push('*PEDIDO DE ORÇAMENTO · '+CONFIG.nome.toUpperCase()+'*');
    L.push('Pedido nº: #'+pedidoNo);
    L.push('Feito em: '+quando);
    L.push(sep);
    L.push('🚗 *VEÍCULO*');
    var anoOk=/^\d{4}$/.test(d.ano)&&+d.ano>=1950&&+d.ano<=anoMax;
    L.push([d.modelo||'Modelo a informar', anoOk?d.ano:'', d.porte].filter(Boolean).join(' · '));
    var cor=[d.cor?'Cor: '+d.cor:'', d.tinta?'Pintura: '+d.tinta:''].filter(Boolean).join(' · ');
    if(cor) L.push(cor);
    L.push(sep);
    if(d.itens.length||d.amassado||d.obs){
      L.push('🔧 *SERVIÇOS*');
      d.itens.forEach(function(i){L.push('▪️ '+(i.q>1?i.q+' x ':'')+i.nome)});
      if(d.amassado) L.push('▪️ Funilaria (tem amassado)');
      if(d.obs) L.push('📝 '+d.obs);
      L.push(sep);
    }
    L.push('📅 Preferência: '+d.data);
    var quem=[d.nome, d.bairro].filter(Boolean).join(' · '); if(quem) L.push('👤 '+quem);
    if(d.origem) L.push('Conheceu por: '+d.origem);
    L.push(sep);
    L.push('📸 *FOTOS: eu envio a seguir, nesta conversa*');
    L.push('1. Carro inteiro');
    L.push('2. Avaria de perto');
    L.push('3. Avaria de longe');
    return L.join('\n');
  }

  function render(){
    regras();
    var d=dados(), t=texto(d), r=$('receipt');
    $('funilaria').hidden=!d.amassado;
    if(!d.itens.length && !d.modelo && !d.nome){ r.classList.add('vazio'); r.textContent='Seu pedido aparece aqui enquanto você preenche.'; }
    else { r.classList.remove('vazio'); r.textContent=t.replace(/\*/g,''); }
    var send=$('send');
    if(CONFIG.whatsapp || CONFIG.api){ send.removeAttribute('aria-disabled'); } else { send.setAttribute('aria-disabled','true'); }
    if(tentou) validar(d,false);
    return {d:d,t:t};
  }

  /* validação: só aparece depois da primeira tentativa de envio; depois some sozinha conforme a pessoa corrige */
  var tentou=false;
  var REGRAS=[
    {id:'e-svc',  campo:'fs-svc', nome:'Serviço',          ok:function(d){return d.itens.length>0}},
    {id:'e-modelo',campo:'modelo',      nome:'Modelo do carro',  ok:function(d){return d.modelo.length>=2}},
    {id:'e-ano',  campo:'ano',          nome:'Ano (use 4 números)',              ok:function(d){if(!d.ano) return true; var n=+d.ano; return /^\d{4}$/.test(d.ano)&&n>=1950&&n<=anoMax}, msg:'Use 4 números, entre 1950 e '+anoMax+'. Ou deixe em branco.'},
    {id:'e-nome', campo:'nome',         nome:'Seu nome',         ok:function(d){return d.nome.length>=2}},
    {id:'e-bairro',campo:'bairro',      nome:'Cidade e bairro',  ok:function(d){return d.bairro.length>=3}},
    {id:'e-fotos',campo:'fotos-ok',     nome:'Confirmação das fotos', ok:function(d){return d.fotos}}
  ];
  function validar(d,focar){
    var erros=[];
    REGRAS.forEach(function(r){
      var ok=r.ok(d), el=$(r.id), campo=$(r.campo);
      el.hidden=ok; if(r.msg) el.textContent=r.msg;
      var alvo=r.id==='e-svc'?$('fs-svc'):r.id==='e-fotos'?$('l-fotos'):campo;
      alvo.classList.toggle('invalido',!ok);
      if(campo && r.id!=='e-svc' && r.id!=='e-fotos') campo.setAttribute('aria-invalid',!ok);
      if(!ok) erros.push(r);
    });
    var sm=$('summary');
    if(erros.length){
      sm.hidden=false;
      sm.innerHTML='<b>'+(erros.length===1?'Falta 1 item':'Faltam '+erros.length+' itens')+' para enviar:</b><ul>'+erros.map(function(r){return '<li><button type="button" data-f="'+r.campo+'">'+r.nome+'</button></li>'}).join('')+'</ul>';
      if(focar) irPara(erros[0].campo);
    } else sm.hidden=true;
    return !erros.length;
  }
  function irPara(id){var el=$(id); if(!el) return; el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'}); setTimeout(function(){el.focus({preventScroll:true})},250);}
  $('summary').addEventListener('click',function(e){var b=e.target.closest('button[data-f]'); if(b) irPara(b.dataset.f);});

  $('form').addEventListener('input',render);
  $('form').addEventListener('change',render);
  $('form').addEventListener('focusout',fixQtd);
  $('form').addEventListener('submit',function(e){e.preventDefault()});
  $('ano').addEventListener('input',function(){var v=this.value.replace(/\D/g,''); if(v!==this.value) this.value=v;});

  /* Com CONFIG.api, o pedido é gravado no servidor antes de abrir o WhatsApp e ganha
     número sequencial (RC-00001). Se o servidor falhar, o pedido segue pelo WhatsApp
     com o número local, para o cliente nunca ficar travado. */
  var registrado=false, enviando=false;
  function payload(d){
    return {itens:d.itens.map(function(i){return {servico:i.id,quantidade:i.q}}), tem_amassado:d.amassado,
      modelo:d.modelo, ano:d.ano, porte:d.porte, cor:d.cor, tipo_pintura:d.tinta, observacao:d.obs,
      preferencia:d.data, nome:d.nome, cidade_bairro:d.bairro, origem:d.origem, site:$('site').value};
  }
  function registrar(d){
    var ctrl=new AbortController(), timer=setTimeout(function(){ctrl.abort()},6000);
    return fetch(CONFIG.api.replace(/\/$/,'')+'/api/pedidos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload(d)),signal:ctrl.signal})
      .then(function(res){ return res.json().catch(function(){return {}}).then(function(j){ return {status:res.status,json:j}; }); })
      .finally(function(){clearTimeout(timer)});
  }
  function abrirWhats(janela){
    var url='https://wa.me/'+CONFIG.whatsapp+'?text='+encodeURIComponent(texto(dados()));
    if(janela && !janela.closed){ janela.location.href=url; } else { location.href=url; }
  }
  function ocupado(sim){
    enviando=sim; var b=$('send');
    b.setAttribute('aria-busy',sim); b.textContent=sim?'Registrando pedido…':'Enviar pedido pelo WhatsApp';
  }

  $('send').addEventListener('click',function(e){
    e.preventDefault();
    if(enviando) return;
    tentou=true;
    var r=render();
    if(!validar(r.d,true)){ $('status').textContent=''; return; }

    if(!CONFIG.api || registrado){ // sem servidor (ou já registrado): só abre o WhatsApp
      $('next').hidden=false;
      if(!CONFIG.whatsapp){ $('status').textContent='Protótipo: o número do WhatsApp ainda não foi configurado. Use "Copiar pedido" para ver o texto.'; return; }
      $('status').textContent='Abrindo o WhatsApp…';
      abrirWhats(window.open('','_blank'));
      return;
    }

    // A aba precisa ser aberta já no clique, senão o navegador bloqueia como pop-up.
    var janela=CONFIG.whatsapp?window.open('','_blank'):null;
    ocupado(true); $('status').textContent='';
    registrar(r.d).then(function(res){
      if(res.status===201 && res.json.numero){
        pedidoNo=res.json.numero; registrado=true; render();
      } else if(res.status===422){
        if(janela) janela.close();
        $('status').textContent='Confira os campos marcados.'; validar(dados(),true); return;
      } else if(res.status===429){
        $('status').textContent=res.json.erro||'Muitos pedidos seguidos.';
      }
      $('next').hidden=false;
      if(CONFIG.whatsapp){ $('status').textContent='Abrindo o WhatsApp…'; abrirWhats(janela); }
      else $('status').textContent='Pedido '+pedidoNo+' registrado (protótipo, sem WhatsApp configurado).';
    }).catch(function(){
      // servidor fora do ar: segue com o número local
      $('next').hidden=false;
      if(CONFIG.whatsapp){ abrirWhats(janela); } else $('status').textContent='Servidor indisponível; o pedido seguiria pelo WhatsApp.';
    }).finally(function(){ ocupado(false); });
  });
  $('copy').addEventListener('click',function(){
    var r=render(), done=function(m){$('status').textContent=m};
    var sel=function(){var rg=document.createRange();rg.selectNodeContents($('receipt'));var s=window.getSelection();s.removeAllRanges();s.addRange(rg)};
    try{navigator.clipboard.writeText(r.t).then(function(){done('Pedido copiado.')},function(){sel();done('Texto selecionado. Use Ctrl+C.')})}catch(err){sel();done('Texto selecionado. Use Ctrl+C.')}
  });

  if(CONFIG.whatsapp){ $('proto').hidden=true; } else { $('copy').hidden=false; }
  $('f-regiao').textContent=CONFIG.regiao;
  render();
})();

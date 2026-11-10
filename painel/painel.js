/* Painel Barão: pedidos por etapa, detalhe do pedido, cadastro manual, calculadora e preços.
   Telas trocadas pelo endereço: #/ (lista), #/p/BP-00001 (pedido), #/novo (novo pedido),
   #/calc (calculadora avulsa), #/calc/BP-00001 (orçamento do pedido), #/precos (bases da calculadora). */
(function(){
  'use strict';
  var CONFIG = window.CONFIG || {servicos:[], portes:['Hatch','Sedan','SUV','Picape']};
  var app = document.getElementById('app');

  var ETAPAS = [
    {id:'novo',              nome:'Novo',              acao:'Já pediu as fotos'},
    {id:'aguardando_fotos',  nome:'Aguardando fotos',  acao:'Já mandou o orçamento'},
    {id:'orcamento_enviado', nome:'Orçamento enviado', acao:'Sinal pago e data marcada'},
    {id:'agendado',          nome:'Agendado',          acao:'O carro chegou'},
    {id:'em_servico',        nome:'Em serviço',        acao:'O carro ficou pronto'},
    {id:'pronto',            nome:'Pronto p/ retirar', acao:'Entregou e recebeu'},
    {id:'finalizado',        nome:'Finalizado'},
    {id:'cancelado',         nome:'Cancelado'}
  ];
  var ABERTAS = ETAPAS.slice(0,6);
  var etapa = function(id){ return ETAPAS.find(function(e){return e.id===id}) || {id:id,nome:id}; };
  var proxima = function(id){ var i=ETAPAS.findIndex(function(e){return e.id===id}); return i>=0 && i<5 ? ETAPAS[i+1] : null; };
  // etapas em que o pedido depende de alguém agir: parado há 2+ dias merece atenção
  var COBRAR = {novo:1, aguardando_fotos:2, orcamento_enviado:2, pronto:2};

  /* ---------- utilidades ---------- */
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}); }
  function nomeServico(id){ var s=CONFIG.servicos.find(function(x){return x.id===id}); return s?s.nome:id; }
  function servicosTexto(itens){ return itens.map(function(i){return (i.quantidade>1?i.quantidade+'× ':'')+nomeServico(i.servico)}).join(', '); }
  function dias(iso){ return Math.floor((Date.now()-new Date(iso).getTime())/86400000); }
  function haQuanto(iso){
    var d=dias(iso); if(d<=0){ var h=Math.floor((Date.now()-new Date(iso).getTime())/3600000); return h<1?'agora há pouco':'há '+h+' h'; }
    return d===1?'há 1 dia':'há '+d+' dias';
  }
  function dataHora(iso){ var d=new Date(iso); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
  function dataCurta(ymd){ if(!ymd) return ''; var p=ymd.split('-'); var d=new Date(+p[0],+p[1]-1,+p[2]); return d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}); }
  function reais(c){ return c==null?'':(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  function paraCentavos(txt){ // "1.250,50" ou "1250" -> 125050
    txt=String(txt||'').replace(/[^\d,.-]/g,'').trim(); if(!txt) return null;
    if(txt.indexOf(',')>=0) txt=txt.replace(/\./g,'').replace(',','.');
    var n=Number(txt); return isFinite(n)&&n>=0 ? Math.round(n*100) : NaN;
  }
  function centavosCampo(c){ return c==null?'':(c/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function telefoneBonito(t){ if(!t) return ''; var d=t.replace(/^55(?=\d{10,11}$)/,''); return d.length===11?'('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7):d.length===10?'('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6):t; }
  function linkWhats(tel, texto){ var d=tel.replace(/\D/g,''); if(d.length<=11) d='55'+d; return 'https://wa.me/'+d+(texto?'?text='+encodeURIComponent(texto):''); }

  var toastTimer;
  function aviso(msg, ruim){ var t=document.getElementById('toast'); t.textContent=msg; t.classList.toggle('ruim',!!ruim); t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){t.hidden=true},2600); }

  // Abas do topo (Pedidos, Calculadora, Preços): aparecem depois do login e marcam a tela atual.
  function marcarAba(id){
    var n=document.getElementById('abas'); n.hidden=false;
    n.querySelectorAll('a').forEach(function(a){ if(a.dataset.a===id) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  }

  /* ---------- API ---------- */
  function api(metodo, caminho, corpo){
    return fetch('/api'+caminho,{method:metodo,credentials:'same-origin',headers:corpo?{'Content-Type':'application/json'}:{},body:corpo?JSON.stringify(corpo):undefined})
      .then(function(res){
        if(res.status===401 && caminho!=='/sessao'){ telaLogin(); throw {tratado:true}; }
        if(res.status===204) return {};
        return res.json().catch(function(){return {}}).then(function(j){ if(!res.ok){ j.status=res.status; throw j; } return j; });
      }, function(){ throw {erro:'Sem conexão. Confira a internet e tente de novo.'}; });
  }
  function falhou(e){ if(e && e.tratado) return; aviso((e&&e.erro)||'Algo deu errado. Tente de novo.', true); }

  /* ---------- login ---------- */
  function telaLogin(){
    document.getElementById('sair').hidden=true; document.getElementById('abas').hidden=true;
    app.innerHTML =
      '<form class="login" id="f-login" novalidate>'+
        '<h1>Entrar</h1>'+
        '<div class="campo"><label for="usuario">Usuário</label><input type="text" id="usuario" autocomplete="username" autocapitalize="none" required></div>'+
        '<div class="campo"><label for="senha">Senha</label><input type="password" id="senha" autocomplete="current-password" required></div>'+
        '<p class="erro" id="e-login" role="alert" hidden></p>'+
        '<button class="btn primario cheio" type="submit" id="b-entrar">Entrar</button>'+
        '<p class="dica">Este aparelho fica conectado por 30 dias.</p>'+
      '</form>';
    var f=document.getElementById('f-login'); document.getElementById('usuario').focus();
    f.addEventListener('submit',function(ev){
      ev.preventDefault();
      var u=document.getElementById('usuario').value.trim(), s=document.getElementById('senha').value, e=document.getElementById('e-login'), b=document.getElementById('b-entrar');
      if(!u||!s){ e.textContent='Preencha usuário e senha.'; e.hidden=false; return; }
      b.disabled=true; b.textContent='Entrando…';
      api('POST','/sessao',{usuario:u,senha:s}).then(function(){ rota(); })
        .catch(function(err){ e.textContent=(err&&err.erro)||'Não foi possível entrar.'; e.hidden=false; document.getElementById('senha').select(); })
        .finally(function(){ b.disabled=false; b.textContent='Entrar'; });
    });
  }
  document.getElementById('sair').addEventListener('click',function(){
    api('DELETE','/sessao').finally(function(){ location.hash='#/'; telaLogin(); });
  });

  /* ---------- lista ---------- */
  var filtro='todos';
  try{ filtro=sessionStorage.getItem('ricar-filtro')||'todos'; }catch(e){}

  function card(p){
    var parado=COBRAR[p.status] && dias(p.atualizado_em)>=COBRAR[p.status];
    return '<a class="card" data-s="'+esc(p.status)+'" href="#/p/'+esc(p.numero)+'">'+
      '<span class="linha1"><b>'+esc(p.cliente)+'</b><span class="num">'+esc(p.numero)+'</span></span>'+
      '<span class="sub">'+esc(p.veiculo)+'</span>'+
      '<span class="sub">'+esc(servicosTexto(p.itens))+'</span>'+
      '<span class="rodape">'+
        (p.data_agendada?'<span class="selo data">'+esc(dataCurta(p.data_agendada))+'</span>':'')+
        '<span class="selo'+(parado?' parado':'')+'">'+(parado?'Parado ':'')+esc(haQuanto(p.atualizado_em))+'</span>'+
      '</span></a>';
  }

  function telaLista(){
    document.getElementById('sair').hidden=false; marcarAba('pedidos');
    app.innerHTML='<p class="carregando">Carregando pedidos…</p>';
    var fechado = filtro==='finalizado'||filtro==='cancelado';
    // Os números das etapas abertas vêm sempre da lista de abertos; vendo Finalizados/Cancelados,
    // buscamos as duas listas ao mesmo tempo para os números não sumirem.
    var pedidos=[api('GET','/painel/pedidos?abertos=1')];
    if(fechado) pedidos.push(api('GET','/painel/pedidos?status='+filtro+'&limite=100'));
    Promise.all(pedidos).then(function(rs){
      var abertos=rs[0].pedidos||[];
      var lista=fechado ? (rs[1].pedidos||[]) : abertos;
      var cont={}; abertos.forEach(function(p){cont[p.status]=(cont[p.status]||0)+1});
      var chips=[{id:'todos',nome:'Todos',n:abertos.length}].concat(ABERTAS.map(function(e){return {id:e.id,nome:e.nome,n:cont[e.id]||0}}))
        .concat([{id:'finalizado',nome:'Finalizados'},{id:'cancelado',nome:'Cancelados'}]);

      var html='<div class="titulo"><h1>Pedidos</h1><a class="link" href="#/novo">+ Novo pedido</a></div>'+
        '<nav class="etapas" aria-label="Filtrar por etapa">'+chips.map(function(c){
          return '<button type="button" class="etapa" data-f="'+c.id+'" aria-pressed="'+(c.id===filtro)+'">'+esc(c.nome)+(c.n!=null?' <span class="n">'+c.n+'</span>':'')+'</button>';
        }).join('')+'</nav>';

      var visiveis = fechado||filtro==='todos' ? lista : lista.filter(function(p){return p.status===filtro});
      if(!visiveis.length){
        html+='<div class="vazio"><b>'+(filtro==='todos'?'Nenhum pedido em aberto.':'Nada nesta etapa.')+'</b>'+
          '<span>Pedidos do site aparecem aqui sozinhos. Quem chamou direto no WhatsApp, cadastre em "Novo pedido".</span>'+
          '<a class="btn claro" href="#/novo">Novo pedido</a></div>';
      } else if(filtro==='todos'){
        ABERTAS.forEach(function(e){
          var g=visiveis.filter(function(p){return p.status===e.id}); if(!g.length) return;
          html+='<section class="grupo"><h2>'+esc(e.nome)+' <span>'+g.length+'</span></h2><div class="cards">'+g.map(card).join('')+'</div></section>';
        });
      } else {
        html+='<div class="cards">'+visiveis.map(card).join('')+'</div>';
      }
      html+='<a class="btn primario flutuante" href="#/novo">+ Novo pedido</a>';
      app.innerHTML=html;
      app.querySelectorAll('.etapa').forEach(function(b){ b.addEventListener('click',function(){
        filtro=b.dataset.f; try{sessionStorage.setItem('ricar-filtro',filtro)}catch(e){} telaLista();
      }); });
    }).catch(falhou);
  }

  /* ---------- detalhe ---------- */
  function telaPedido(numero){
    document.getElementById('sair').hidden=false; marcarAba('pedidos');
    app.innerHTML='<p class="carregando">Carregando pedido…</p>';
    api('GET','/painel/pedidos/'+encodeURIComponent(numero)).then(function(p){
      var et=etapa(p.status), prox=proxima(p.status), o=p.orcamento&&p.orcamento.resultado?p.orcamento:null;
      var primeiroNome=(p.cliente||'').split(' ')[0];
      var html=
        '<a class="link voltar" href="#/">← Pedidos</a>'+
        '<div class="cab" data-s="'+esc(p.status)+'">'+
          '<h1>'+esc(p.cliente)+'</h1>'+
          '<div class="meta"><span class="status">'+esc(et.nome)+'</span><span>'+esc(p.numero)+'</span>'+(p.referencia&&p.referencia!==p.numero?'<span>Recibo '+esc(p.referencia)+'</span>':'')+'<span>'+esc(haQuanto(p.atualizado_em))+' nesta etapa</span></div>'+
        '</div>'+
        '<div class="layout"><div class="coluna">'+

        // ação principal
        '<section class="bloco acao" data-s="'+esc(p.status)+'">'+
          (prox?
            '<h2>Próximo passo</h2>'+
            '<div class="campo"><label for="nota">Anotação <span class="opt">(opcional)</span></label><input type="text" id="nota" maxlength="300" placeholder="Ex.: mandou as fotos, sinal de R$ 300 pago"></div>'+
            '<button class="btn primario cheio" id="avancar" type="button">Mover para: '+esc(prox.nome)+'</button>'+
            '<p class="dica">'+esc(et.acao)+'? Toque acima para mudar a etapa.</p>'
          : '<h2>'+esc(et.nome)+'</h2><p class="dica">Este pedido está encerrado. Se precisar, reabra mudando a etapa abaixo.</p>')+
          '<div class="botoes">'+
            (p.telefone?'<a class="btn wpp" target="_blank" rel="noopener" href="'+esc(linkWhats(p.telefone,'Olá, '+primeiroNome+'! Aqui é da Barão Pintura Automotiva, sobre o seu pedido '+p.numero+'.'))+'">Abrir conversa no WhatsApp</a>':'')+
          '</div>'+
          '<details><summary class="link">Mudar para outra etapa</summary><div class="campo" style="margin-top:8px">'+
            '<label for="outra">Etapa</label><select id="outra">'+ETAPAS.map(function(e){return '<option value="'+e.id+'"'+(e.id===p.status?' selected':'')+'>'+esc(e.nome)+'</option>'}).join('')+'</select>'+
            '<button class="btn claro" id="mudar" type="button">Mudar etapa</button></div></details>'+
        '</section>'+

        // orçamento calculado
        '<section class="bloco" id="b-orc"><h2>Orçamento</h2>'+
          (o?
            '<div class="orc"><strong class="preco">'+esc(C.brl(o.resultado.total))+'</strong>'+
              '<span class="dica">'+esc(o.resumo||'')+'</span>'+
              '<span class="dica">Sinal '+esc(C.brl(o.resultado.sinal))+' · prazo '+(o.resultado.semanas>1?'até '+o.resultado.semanas+' semanas':'até 1 semana')+(o.calculado_em?' · calculado '+esc(dataHora(o.calculado_em)):'')+'</span></div>'+
            '<div class="botoes">'+
              (p.telefone?'<a class="btn wpp" target="_blank" rel="noopener" href="'+esc(linkWhats(p.telefone,o.mensagem||''))+'">Enviar no WhatsApp</a>':'')+
              '<button class="btn claro" type="button" id="copiar-orc">Copiar mensagem</button>'+
              '<a class="btn claro" href="#/calc/'+esc(p.numero)+'">Refazer cálculo</a></div>'
          : '<p class="dica">Ainda sem orçamento. Com as fotos do cliente em mãos, calcule aqui: os serviços e o carro do pedido já vêm marcados.</p>'+
            '<a class="btn primario cheio" href="#/calc/'+esc(p.numero)+'">Calcular orçamento</a>')+
        '</section>'+

        // valor, sinal e contato
        '<form class="bloco" id="f-dados" novalidate><h2>Valor, sinal e contato</h2>'+
          '<div class="campo"><label for="tel">Telefone (WhatsApp)</label><input type="tel" id="tel" inputmode="tel" placeholder="(11) 99999-8888" value="'+esc(telefoneBonito(p.telefone))+'"><p class="erro" id="e-tel" hidden></p></div>'+
          '<div class="duas empilha">'+
            '<div class="campo"><label for="valor">Valor (R$)</label><input type="text" id="valor" inputmode="decimal" placeholder="0,00" value="'+esc(centavosCampo(p.valor_orcado_centavos))+'"><p class="erro" id="e-valor" hidden></p></div>'+
            '<div class="campo"><label for="sinal">Sinal (R$)</label><input type="text" id="sinal" inputmode="decimal" placeholder="0,00" value="'+esc(centavosCampo(p.sinal_centavos))+'"><button class="link" type="button" id="metade">Usar 50% do valor</button><p class="erro" id="e-sinal" hidden></p></div>'+
          '</div>'+
          '<div class="campo"><label for="data">Data agendada</label><input type="date" id="data" value="'+esc(p.data_agendada||'')+'"></div>'+
          '<button class="btn cheio" type="submit" id="salvar">Salvar</button>'+
        '</form>'+
        '</div><div class="coluna">'+

        // carro e serviços
        '<section class="bloco"><h2>Carro e serviços</h2>'+
          '<dl class="dl">'+
            '<dt>Carro</dt><dd>'+esc(p.veiculo)+'</dd>'+
            (p.cor||p.tipo_pintura?'<dt>Cor</dt><dd>'+esc([p.cor,p.tipo_pintura].filter(Boolean).join(' · '))+'</dd>':'')+
            '<dt>Serviços</dt><dd><ul class="servicos">'+p.itens.map(function(i){return '<li>'+(i.quantidade>1?i.quantidade+'× ':'')+esc(nomeServico(i.servico))+'</li>'}).join('')+(p.tem_amassado?'<li>Funilaria (tem amassado)</li>':'')+'</ul></dd>'+
            (p.observacao?'<dt>Obs.</dt><dd>'+esc(p.observacao)+'</dd>':'')+
            (p.preferencia?'<dt>Prefere</dt><dd>'+esc(p.preferencia)+'</dd>':'')+
            (p.cidade_bairro?'<dt>Onde</dt><dd>'+esc(p.cidade_bairro)+'</dd>':'')+
            (p.origem?'<dt>Conheceu</dt><dd>'+esc(p.origem)+'</dd>':'')+
          '</dl></section>'+

        // histórico
        '<section class="bloco"><h2>Histórico</h2><ol class="linha-tempo">'+
          p.eventos.slice().reverse().map(function(e){ return '<li data-s="'+esc(e.status)+'"><div><b>'+esc(etapa(e.status).nome)+'</b>'+(e.nota?' · '+esc(e.nota):'')+'<small>'+esc(dataHora(e.criado_em))+'</small></div></li>'; }).join('')+
        '</ol></section>'+
        '</div></div>';
      app.innerHTML=html;

      function mudar(status, nota, botao){
        if(botao){ botao.disabled=true; }
        api('PATCH','/painel/pedidos/'+encodeURIComponent(p.numero)+'/status',{status:status,nota:nota||''})
          .then(function(){ aviso('Etapa: '+etapa(status).nome); telaPedido(p.numero); })
          .catch(function(e){ falhou(e); if(botao) botao.disabled=false; });
      }
      var av=document.getElementById('avancar');
      if(av) av.addEventListener('click',function(){ mudar(prox.id, document.getElementById('nota').value.trim(), av); });
      document.getElementById('mudar').addEventListener('click',function(){
        var s=document.getElementById('outra').value; if(s===p.status){ aviso('Já está nesta etapa.'); return; }
        mudar(s, 'Mudado manualmente', this);
      });
      var co=document.getElementById('copiar-orc');
      if(co) co.addEventListener('click',function(){ copiar(o.mensagem||''); });
      document.getElementById('metade').addEventListener('click',function(){
        var v=paraCentavos(document.getElementById('valor').value);
        if(!v){ aviso('Preencha o valor primeiro.', true); document.getElementById('valor').focus(); return; }
        document.getElementById('sinal').value=centavosCampo(Math.round(v/200)*100);
      });
      document.getElementById('f-dados').addEventListener('submit',function(ev){
        ev.preventDefault();
        var tel=document.getElementById('tel').value.replace(/\D/g,''), v=paraCentavos(document.getElementById('valor').value), s=paraCentavos(document.getElementById('sinal').value);
        var erros={};
        if(tel && !(tel.length===10||tel.length===11||(/^55/.test(tel)&&(tel.length===12||tel.length===13)))) erros.tel='Use DDD + número. Ex.: (11) 99999-8888.';
        if(Number.isNaN(v)) erros.valor='Use só números. Ex.: 1.250,00';
        if(Number.isNaN(s)) erros.sinal='Use só números. Ex.: 300,00';
        else if(s!=null && v!=null && s>v) erros.sinal='O sinal não pode ser maior que o valor.';
        ['tel','valor','sinal'].forEach(function(k){ var el=document.getElementById('e-'+k), i=document.getElementById(k); el.hidden=!erros[k]; el.textContent=erros[k]||''; i.classList.toggle('invalido',!!erros[k]); });
        if(Object.keys(erros).length) return;
        var b=document.getElementById('salvar'); b.disabled=true; b.textContent='Salvando…';
        api('PATCH','/painel/pedidos/'+encodeURIComponent(p.numero),{telefone:tel,valor_orcado_centavos:v,sinal_centavos:s,data_agendada:document.getElementById('data').value||null})
          .then(function(){ aviso('Salvo'); telaPedido(p.numero); })
          .catch(function(e){ falhou(e); b.disabled=false; b.textContent='Salvar'; });
      });
    }).catch(function(e){
      if(e && e.status===404){ app.innerHTML='<a class="link voltar" href="#/">← Pedidos</a><div class="vazio"><b>Pedido não encontrado.</b></div>'; return; }
      falhou(e);
    });
  }

  /* ---------- novo pedido (cliente que chamou direto no WhatsApp) ---------- */
  function telaNovo(){
    document.getElementById('sair').hidden=false; marcarAba('pedidos');
    var svcs=CONFIG.servicos.map(function(s){
      return '<label class="svc" id="row-'+s.id+'"><span class="topo"><input type="checkbox" id="s-'+s.id+'">'+esc(s.nome)+'</span>'+
        (s.max?'<span class="qtd">Quantas? <input type="number" id="q-'+s.id+'" min="1" max="'+s.max+'" value="1" aria-label="Quantidade de '+esc(s.nome)+'"></span>':'')+'</label>';
    }).join('');
    app.innerHTML=
      '<a class="link voltar" href="#/">← Pedidos</a>'+
      '<div class="titulo"><h1>Novo pedido</h1></div>'+
      '<p class="dica">Para clientes que chamaram direto no WhatsApp. Só nome, carro e um serviço são obrigatórios.</p>'+
      '<form class="coluna" id="f-novo" novalidate>'+
        '<section class="bloco"><h2>Cliente</h2>'+
          '<div class="duas empilha">'+
            '<div class="campo"><label for="n-nome">Nome</label><input type="text" id="n-nome" maxlength="60" autocomplete="off"><p class="erro" id="e-nome" hidden></p></div>'+
            '<div class="campo"><label for="n-tel">Telefone <span class="opt">(opcional)</span></label><input type="tel" id="n-tel" inputmode="tel" placeholder="(11) 99999-8888"><p class="erro" id="e-telefone" hidden></p></div>'+
          '</div>'+
          '<div class="duas empilha">'+
            '<div class="campo"><label for="n-bairro">Cidade e bairro <span class="opt">(opcional)</span></label><input type="text" id="n-bairro" maxlength="60"></div>'+
            '<div class="campo"><label for="n-origem">Como conheceu <span class="opt">(opcional)</span></label><select id="n-origem"><option value="">Não sei</option><option>Indicação de amigo</option><option>Instagram</option><option>Google</option><option>Já sou cliente</option><option>Outro</option></select></div>'+
          '</div>'+
        '</section>'+
        '<section class="bloco"><h2>Carro</h2>'+
          '<div class="duas">'+
            '<div class="campo"><label for="n-modelo">Modelo</label><input type="text" id="n-modelo" maxlength="40"><p class="erro" id="e-modelo" hidden></p></div>'+
            '<div class="campo"><label for="n-ano">Ano <span class="opt">(opcional)</span></label><input type="text" id="n-ano" inputmode="numeric" maxlength="4"><p class="erro" id="e-ano" hidden></p></div>'+
          '</div>'+
          '<div class="campo"><span class="rotulo">Tipo</span><div class="chips">'+CONFIG.portes.map(function(p,i){return '<label class="chip"><input type="radio" name="n-porte" value="'+esc(p)+'"'+(i===0?' checked':'')+'><span>'+esc(p)+'</span></label>'}).join('')+'</div></div>'+
          '<div class="duas empilha">'+
            '<div class="campo"><label for="n-cor">Cor <span class="opt">(opcional)</span></label><input type="text" id="n-cor" maxlength="30"></div>'+
            '<div class="campo"><label for="n-tinta">Pintura</label><select id="n-tinta"><option value="">Não sei</option><option>Sólida</option><option>Metálica</option><option>Perolizada</option></select></div>'+
          '</div>'+
        '</section>'+
        '<section class="bloco" id="b-svc"><h2>Serviços</h2><div class="svcs">'+svcs+'</div><p class="erro" id="e-itens" hidden></p>'+
          '<label class="chip" style="align-self:flex-start"><input type="checkbox" id="n-amassado"><span>Tem amassado (funilaria)</span></label>'+
          '<div class="campo"><label for="n-obs">Anotações <span class="opt">(opcional)</span></label><textarea id="n-obs" maxlength="300" placeholder="Ex.: risco no para-choque traseiro, quer para antes do dia 20"></textarea></div>'+
        '</section>'+
        '<p class="erro" id="e-geral" role="alert" hidden></p>'+
        '<button class="btn primario cheio" type="submit" id="criar">Cadastrar pedido</button>'+
      '</form>';

    function regras(){
      var comp=document.getElementById('s-completa'); var on=comp&&comp.checked;
      CONFIG.servicos.forEach(function(s){ if(s.exclusivo) return; var c=document.getElementById('s-'+s.id); if(on&&c.checked) c.checked=false; c.disabled=on; document.getElementById('row-'+s.id).classList.toggle('off',on); });
    }
    document.getElementById('b-svc').addEventListener('change',regras);
    document.getElementById('n-ano').addEventListener('input',function(){ this.value=this.value.replace(/\D/g,''); });
    document.getElementById('n-nome').focus();

    document.getElementById('f-novo').addEventListener('submit',function(ev){
      ev.preventDefault();
      var itens=[]; CONFIG.servicos.forEach(function(s){ if(document.getElementById('s-'+s.id).checked){ var q=document.getElementById('q-'+s.id); itens.push({servico:s.id,quantidade:q?Math.max(1,Math.min(s.max,Math.round(+q.value)||1)):1}); } });
      var corpo={itens:itens, nome:val('n-nome'), telefone:val('n-tel'), cidade_bairro:val('n-bairro'), origem:val('n-origem'),
        modelo:val('n-modelo'), ano:val('n-ano'), porte:(document.querySelector('input[name=n-porte]:checked')||{}).value||'',
        cor:val('n-cor'), tipo_pintura:val('n-tinta'), tem_amassado:document.getElementById('n-amassado').checked, observacao:val('n-obs'), preferencia:''};
      function val(id){ return document.getElementById(id).value.trim(); }
      var erros={};
      if(!itens.length) erros.itens='Marque pelo menos um serviço.';
      if(corpo.nome.length<2) erros.nome='Diga o nome do cliente.';
      if(corpo.modelo.length<2) erros.modelo='Diga o modelo do carro.';
      mostrar(erros);
      if(Object.keys(erros).length) return;
      var b=document.getElementById('criar'); b.disabled=true; b.textContent='Cadastrando…';
      api('POST','/painel/pedidos',corpo).then(function(r){ aviso('Pedido '+r.numero+' cadastrado'); location.hash='#/p/'+r.numero; })
        .catch(function(e){ if(e&&e.erros){ mostrar(e.erros); } else falhou(e); b.disabled=false; b.textContent='Cadastrar pedido'; });
    });
    function mostrar(erros){
      ['nome','telefone','modelo','ano','itens'].forEach(function(k){ var el=document.getElementById('e-'+k); if(!el) return; el.hidden=!erros[k]; el.textContent=erros[k]||''; });
      var primeiro=document.querySelector('#f-novo .erro:not([hidden])'); if(primeiro) primeiro.scrollIntoView({block:'center'});
      var g=document.getElementById('e-geral'); g.hidden=!Object.keys(erros).length; g.textContent='Confira os campos marcados.';
    }
  }

  /* ---------- calculadora ---------- */
  var C = window.CalcBarao;
  var basesCache = null;
  // As bases (tabela de preços) vêm do servidor uma vez e ficam guardadas enquanto o painel está aberto.
  function carregarBases(forcar){
    if(!basesCache || forcar) basesCache = api('GET','/painel/calculadora').catch(function(e){ basesCache=null; throw e; });
    return basesCache;
  }
  function brl(v){ return C.brl(v); }
  function copiar(texto){
    var ok=function(){ aviso('Mensagem copiada'); };
    try{ navigator.clipboard.writeText(texto).then(ok,function(){ aviso('Não deu para copiar. Selecione o texto e copie.', true); }); }
    catch(e){ aviso('Não deu para copiar. Selecione o texto e copie.', true); }
  }
  var selAvulsa = null; // a calculadora avulsa lembra o que foi marcado enquanto o painel está aberto

  function telaCalc(numero){
    document.getElementById('sair').hidden=false;
    marcarAba(numero?'pedidos':'calc');
    app.innerHTML='<p class="carregando">Carregando calculadora…</p>';
    Promise.all([carregarBases(), numero?api('GET','/painel/pedidos/'+encodeURIComponent(numero)):null]).then(function(rs){
      var cb=rs[0], b=cb.bases, p=rs[1], avisosPedido=[];
      var sel;
      if(p && p.orcamento && p.orcamento.sel){
        sel=C.normalizar(b, p.orcamento.sel);
        if(cb.atualizado_em && p.orcamento.calculado_em && cb.atualizado_em>p.orcamento.calculado_em)
          avisosPedido.push('Os preços foram alterados depois deste cálculo ('+dataHora(cb.atualizado_em)+'). O valor pode ter mudado; confira antes de salvar.');
      } else if(p){
        sel=C.selecaoInicial(b);
        sel.itens=p.itens.map(function(i){return {id:i.servico,q:i.quantidade}});
        var porte=b.portes.find(function(x){return x.nome.toLowerCase()===String(p.porte||'').toLowerCase()});
        var tinta=b.tintas.find(function(x){return x.nome.toLowerCase()===String(p.tipo_pintura||'').toLowerCase()});
        if(porte) sel.porte=porte.id;
        if(tinta) sel.tinta=tinta.id; else avisosPedido.push('O cliente não disse o tipo de pintura: a conta está como sólida. Confira pelas fotos.');
        sel=C.normalizar(b, sel);
      } else {
        sel=selAvulsa||C.selecaoInicial(b);
      }
      if(p && p.tem_amassado) avisosPedido.push('O cliente disse que tem amassado: coloque o valor da funilaria do parceiro.');

      var marcados={}; sel.itens.forEach(function(i){marcados[i.id]=i.q});
      var html=(p?'<a class="link voltar" href="#/p/'+esc(p.numero)+'">← Pedido '+esc(p.numero)+'</a>'+
          '<div class="cab"><h1>Orçamento</h1><div class="meta"><span>'+esc(p.cliente)+'</span><span>'+esc(p.veiculo)+'</span>'+(p.cor?'<span>'+esc(p.cor)+'</span>':'')+'</div></div>'
        : '<div class="titulo"><h1>Calculadora</h1><button class="link" type="button" id="limpar">Limpar</button></div>'+
          '<p class="dica">Para calcular qualquer serviço, mesmo fora de um pedido. Nada aqui é salvo: copie a mensagem se precisar.</p>')+
        avisosPedido.map(function(t){return '<p class="alerta">'+esc(t)+'</p>'}).join('')+
        '<div class="layout calc"><div class="coluna">'+
          '<section class="bloco" id="c-svc"><h2>Serviços</h2><div class="svcs">'+
            b.servicos.map(function(s){
              var q=marcados[s.id];
              return '<label class="svc" id="crow-'+s.id+'"><span class="topo"><input type="checkbox" data-id="'+s.id+'"'+(q?' checked':'')+'>'+esc(s.nome)+'</span>'+
                (s.max?'<span class="qtd">Quantas? <input type="number" id="cq-'+s.id+'" min="1" max="'+s.max+'" value="'+(q||1)+'" aria-label="Quantidade de '+esc(s.nome)+'"></span>':'')+'</label>';
            }).join('')+'</div></section>'+
          '<section class="bloco"><h2>Carro</h2>'+
            '<div class="campo"><span class="rotulo">Tipo</span><div class="chips">'+b.portes.map(function(x){return '<label class="chip"><input type="radio" name="c-porte" value="'+x.id+'"'+(x.id===sel.porte?' checked':'')+'><span>'+esc(x.nome)+'</span></label>'}).join('')+'</div></div>'+
            '<div class="campo"><span class="rotulo">Pintura</span><div class="chips">'+b.tintas.map(function(x){return '<label class="chip"><input type="radio" name="c-tinta" value="'+x.id+'"'+(x.id===sel.tinta?' checked':'')+'><span>'+esc(x.nome)+'</span></label>'}).join('')+'</div></div>'+
          '</section>'+
          '<section class="bloco"><h2>Desconto e funilaria</h2><div class="duas">'+
            '<div class="campo"><label for="c-desc">Desconto loja (%)</label><input type="number" id="c-desc" min="0" max="30" step="1" inputmode="numeric" value="'+sel.desc+'"></div>'+
            '<div class="campo"><label for="c-fun">Funilaria do parceiro (R$)</label><input type="number" id="c-fun" min="0" step="10" inputmode="numeric" value="'+sel.fun+'"></div>'+
          '</div></section>'+
          '<details class="bloco"><summary>Custos deste cálculo</summary>'+
            '<div class="tres">'+
              '<div class="campo"><label for="c-hora">Hora (R$)</label><input type="number" id="c-hora" min="0" step="5" inputmode="decimal" value="'+sel.hora+'"></div>'+
              '<div class="campo"><label for="c-dia">Horas/dia</label><input type="number" id="c-dia" min="1" max="14" step="1" inputmode="numeric" value="'+sel.horas_dia+'"></div>'+
              '<div class="campo"><label for="c-res">Reserva (%)</label><input type="number" id="c-res" min="0" max="60" step="1" inputmode="numeric" value="'+sel.reserva+'"></div>'+
            '</div>'+
            '<label class="marcar"><input type="checkbox" id="c-troca"'+(sel.troca?' checked':'')+'><span>Contar a troca da oficina B (cada dia usado custa um dia de trabalho para o dono)</span></label>'+
            '<p class="dica">Valem só para este cálculo. Para mudar de vez, use a tela <a href="#/precos">Preços</a>.</p>'+
          '</details>'+
        '</div><div class="coluna"><section class="bloco resultado" id="resultado" aria-live="polite"></section></div></div>';
      app.innerHTML=html;

      var r, msg, ultimoHtml='';
      function ler(){
        var itens=[];
        b.servicos.forEach(function(s){
          var c=app.querySelector('#c-svc input[data-id="'+s.id+'"]'); if(!c.checked) return;
          var q=document.getElementById('cq-'+s.id); itens.push({id:s.id,q:q?+q.value:1});
        });
        var v=function(id){ return document.getElementById(id).value; };
        return {itens:itens, porte:(app.querySelector('input[name=c-porte]:checked')||{}).value, tinta:(app.querySelector('input[name=c-tinta]:checked')||{}).value,
          desc:v('c-desc')===''?0:+v('c-desc'), fun:v('c-fun')===''?0:+v('c-fun'), hora:v('c-hora')===''?b.hora:+v('c-hora'),
          horas_dia:v('c-dia')===''?b.horas_dia:+v('c-dia'), reserva:v('c-res')===''?b.reserva:+v('c-res'), troca:document.getElementById('c-troca').checked};
      }
      // pintura completa trava as outras peças
      function regras(){
        var comp=b.servicos.find(function(s){return s.exclusivo});
        var on=comp && app.querySelector('#c-svc input[data-id="'+comp.id+'"]').checked;
        b.servicos.forEach(function(s){ if(s.exclusivo) return;
          var c=app.querySelector('#c-svc input[data-id="'+s.id+'"]'); if(on&&c.checked) c.checked=false; c.disabled=on;
          document.getElementById('crow-'+s.id).classList.toggle('off',!!on); });
      }
      function atualizar(){
        regras();
        r=C.calcular(b, ler()); if(!p) selAvulsa=r.sel;
        msg=C.mensagem(r, p?{nome:p.cliente, veiculo:(p.veiculo||'').split(' · ')[0], numero:p.numero}:null);
        var el=document.getElementById('resultado');
        if(r.vazio){ el.innerHTML=ultimoHtml='<span class="rotulo">Preço sugerido</span><strong class="preco">R$ 0</strong><p class="dica">Marque pelo menos um serviço.</p>'; return; }
        var k=r.k;
        var partes=[
          {n:'Material',v:k.material,c:'var(--muted)'},
          {n:'Mão de obra ('+C.horasTxt(k.horas)+' h)',v:k.mao,c:'var(--cor)'},
          {n:'Troca na oficina B',v:k.espaco,c:'var(--verniz)'},
          {n:'Reserva',v:k.reserva,c:'var(--fita)'}];
        if(r.sel.desc>0) partes.push({n:'Desconto loja',v:-r.desconto,c:'transparent'});
        if(r.fun>0) partes.push({n:'Funilaria (repasse ao parceiro)',v:r.fun,c:'#7a4fb3'});
        var tot=partes.reduce(function(a,x){return a+Math.max(0,x.v)},0)||1;
        var h='<span class="rotulo">Preço sugerido</span><strong class="preco">'+brl(r.total)+'</strong><p class="dica">'+esc(C.resumo(r))+'</p>'+
          '<div class="pilha" aria-hidden="true">'+partes.filter(function(x){return x.v>0}).map(function(x){return '<span style="width:'+(x.v/tot*100)+'%;background:'+x.c+'"></span>'}).join('')+'</div>'+
          '<div class="legenda">'+partes.filter(function(x){return Math.round(x.v)!==0}).map(function(x){return '<i style="background:'+x.c+(x.c==='transparent'?';border:1px solid var(--line)':'')+'"></i><span>'+esc(x.n)+'</span><span class="v">'+(x.v<0?'− ':'')+brl(Math.abs(x.v))+'</span>'}).join('')+'</div>';
        if(r.sugerirCompleta) h+='<div class="alerta"><span>'+(r.pintura>=r.sugerirCompleta.preco?'Essas peças já custam mais que a pintura completa':'Essas peças já somam '+r.sugerirCompleta.pct+'% da pintura completa')+' ('+brl(r.sugerirCompleta.preco)+'). Para o cliente, a pintura completa pode valer mais a pena, e a cor fica uniforme.</span><button class="btn claro" type="button" data-acao="completa">Trocar para pintura completa</button></div>';
        if(r.sugerirEsmaecimento) h+='<div class="alerta"><span>Em cor '+esc(r.tinta.nome.toLowerCase())+', a peça vizinha costuma precisar de esmaecimento para a cor não ficar diferente.</span><button class="btn claro" type="button" data-acao="esmaecimento">Adicionar esmaecimento</button></div>';
        if(r.abaixoDoCusto) h+='<div class="alerta ruim">Com '+r.sel.desc+'% de desconto, a pintura sai por '+brl(r.pintura)+', abaixo do custo de '+brl(k.base)+' (material, mão de obra e troca). Reduza o desconto.</div>';
        if(r.mercado){
          var m=r.mercado, a=m.lo*0.6, z=m.hi*1.2, pos=Math.max(0,Math.min(100,(m.preco-a)/(z-a)*100)), l=(m.lo-a)/(z-a)*100, d=(m.hi-a)/(z-a)*100;
          h+='<div class="mercado"><span class="rotulo">Comparação com o mercado</span>'+
            '<div class="trilho" style="background:linear-gradient(90deg,var(--line) '+l+'%,color-mix(in srgb,var(--ok) 50%,transparent) '+l+'%,color-mix(in srgb,var(--ok) 50%,transparent) '+d+'%,var(--line) '+d+'%)"><span class="pino" style="left:'+pos+'%">'+(r.fun>0?'Pintura':'Seu preço')+'</span></div>'+
            '<div class="pontas"><span>Mercado: '+brl(m.lo)+(m.parcial?' (sem esmaecimento)':'')+'</span><span>até '+brl(m.hi)+'</span></div>'+
            '<p class="veredito v-'+m.nivel+'">'+esc(m.texto)+'</p></div>';
        }
        h+='<div class="kpis"><div class="kpi"><b>'+brl(r.sobraHora)+'</b><span>sobra por hora de trabalho'+(r.sel.troca?', já contando a troca':'')+'</span></div>'+
          '<div class="kpi"><b>'+r.semanas+'</b><span>'+(r.semanas>1?'fins de semana':'fim de semana')+' para entregar'+(r.sel.troca?'. Depois, '+r.diasTroca+(r.diasTroca>1?' dias':' dia')+' de troca com o dono da oficina B':'')+'</span></div></div>'+
          '<div class="campo"><span class="rotulo">Mensagem para o cliente</span><pre class="msg">'+esc(msg)+'</pre></div>'+
          '<div class="botoes">'+
            (p?'<button class="btn primario" type="button" id="c-salvar">Salvar no pedido</button>'+(p.telefone?'<button class="btn wpp" type="button" id="c-enviar">Salvar e enviar no WhatsApp</button>':''):'')+
            '<button class="btn claro" type="button" id="c-copiar">Copiar mensagem</button></div>'+
          (p&&!p.telefone?'<p class="dica">Sem telefone no pedido: copie a mensagem e mande na conversa do cliente.</p>':'');
        // Só redesenha se mudou: o "change" de um campo dispara quando a pessoa toca no botão,
        // e redesenhar naquela hora trocaria o botão embaixo do dedo e o toque se perderia.
        if(h!==ultimoHtml){ el.innerHTML=h; ultimoHtml=h; }
      }
      app.querySelector('.layout').addEventListener('input',atualizar);
      app.querySelector('.layout').addEventListener('change',atualizar);
      document.getElementById('resultado').addEventListener('click',function(ev){
        var t=ev.target.closest('button'); if(!t) return;
        if(t.dataset.acao==='completa'){ var comp=b.servicos.find(function(s){return s.exclusivo}); app.querySelector('#c-svc input[data-id="'+comp.id+'"]').checked=true; atualizar(); }
        else if(t.dataset.acao==='esmaecimento'){ app.querySelector('#c-svc input[data-id="esmaecimento"]').checked=true; atualizar(); }
        else if(t.id==='c-copiar') copiar(msg);
        else if(t.id==='c-salvar') salvar(false, t);
        else if(t.id==='c-enviar') salvar(true, t);
      });
      var limpar=document.getElementById('limpar');
      if(limpar) limpar.addEventListener('click',function(){ selAvulsa=null; telaCalc(null); });

      function salvar(enviar, botao){
        if(r.vazio){ aviso('Marque pelo menos um serviço.', true); return; }
        // a aba do WhatsApp precisa abrir já no clique, senão o navegador bloqueia
        var janela=enviar?window.open('','_blank'):null;
        botao.disabled=true;
        api('PUT','/painel/pedidos/'+encodeURIComponent(p.numero)+'/orcamento',{
          calculo:C.foto(r,msg,cb.atualizado_em), valor_orcado_centavos:Math.round(r.total*100), sinal_centavos:Math.round(r.sinal*100)
        }).then(function(){
          aviso('Orçamento salvo no pedido');
          if(janela){ if(!janela.closed) janela.location.href=linkWhats(p.telefone,msg); else location.href=linkWhats(p.telefone,msg); }
          location.hash='#/p/'+p.numero;
        }).catch(function(e){ if(janela&&!janela.closed) janela.close(); botao.disabled=false; falhou(e); });
      }
      atualizar();
    }).catch(function(e){
      if(e && e.status===404){ app.innerHTML='<a class="link voltar" href="#/">← Pedidos</a><div class="vazio"><b>Pedido não encontrado.</b></div>'; return; }
      falhou(e);
    });
  }

  /* ---------- preços (bases da calculadora) ---------- */
  function telaPrecos(){
    document.getElementById('sair').hidden=false;
    marcarAba('precos');
    app.innerHTML='<p class="carregando">Carregando preços…</p>';
    carregarBases().then(function(cb){ desenharPrecos(cb, cb.bases); }).catch(falhou);
  }
  function pctFator(f){ return Math.round((f-1)*100); }
  function desenharPrecos(cb, b){
    var pd=cb.padrao;
    var padraoDe=function(id){ return pd.servicos.find(function(s){return s.id===id}); };
    var fatorPadrao=function(lista,id){ return (lista.find(function(x){return x.id===id})||{}).fator; };
    function campo(id, rotulo, valor, padrao, extra){
      return '<div class="campo"><label for="'+id+'">'+rotulo+'</label><input type="number" id="'+id+'" step="any" inputmode="decimal" value="'+valor+'" data-padrao="'+padrao+'"'+(extra||'')+'>'+
        '<span class="padrao" hidden>Padrão: '+String(padrao).replace('.',',')+'</span><p class="erro" id="e-'+id+'" hidden></p></div>';
    }
    var html='<div class="titulo"><h1>Preços</h1></div>'+
      '<p class="dica">A base da calculadora. Mudou aqui, vale para todos os cálculos novos. Orçamentos já salvos nos pedidos não mudam. '+
        (cb.atualizado_em?'Última alteração: '+esc(dataHora(cb.atualizado_em))+'.':'Usando os valores iniciais.')+'</p>'+
      '<form class="coluna" id="f-precos" novalidate>'+
      '<section class="bloco"><h2>Custos do Ricardo</h2><div class="tres">'+
        campo('p-hora','Valor da hora (R$)',b.hora,pd.hora)+campo('p-dia','Horas por dia',b.horas_dia,pd.horas_dia)+campo('p-res','Reserva (%)',b.reserva,pd.reserva)+
      '</div>'+
      '<label class="marcar"><input type="checkbox" id="p-troca"'+(b.troca?' checked':'')+'><span>Contar a troca da oficina B nos cálculos (cada dia usado custa um dia de trabalho para o dono)</span></label>'+
      '<p class="dica">Reserva cobre imprevistos: retrabalho, material extra, ferramenta que quebra.</p></section>'+
      '<section class="bloco"><h2>Serviços</h2><p class="dica">Material e horas para um <b>hatch com tinta sólida</b>. Carros maiores e tintas especiais aumentam a partir daqui (veja abaixo). O mercado é a faixa de preço (R$) cobrada em São Paulo.</p>'+
        '<div class="precos">'+b.servicos.map(function(s){
          var d=padraoDe(s.id);
          return '<fieldset class="preco-svc"><legend>'+esc(s.nome)+'</legend><div class="duas">'+
            campo('m-'+s.id,'Material (R$)',s.material,d.material)+campo('h-'+s.id,'Horas',s.horas,d.horas)+
            (s.mercado_min!=null?campo('lo-'+s.id,'Mercado: de',s.mercado_min,d.mercado_min)+campo('hi-'+s.id,'até',s.mercado_max,d.mercado_max):'<p class="dica" style="grid-column:1/-1">Sem referência de mercado.</p>')+
            '</div><p class="erro" id="e-mercado-'+s.id+'" hidden></p></fieldset>';
        }).join('')+'</div></section>'+
      '<section class="bloco"><h2>Porte e tinta</h2><p class="dica">Quanto a mais de material e de horas, em %. Hatch e tinta sólida são a base.</p>'+
        '<div class="tres">'+b.portes.slice(1).map(function(x){return campo('f-'+x.id,x.nome+' (+%)',pctFator(x.fator),pctFator(fatorPadrao(pd.portes,x.id)))}).join('')+'</div>'+
        '<div class="duas">'+b.tintas.slice(1).map(function(x){return campo('f-'+x.id,x.nome+' (+%)',pctFator(x.fator),pctFator(fatorPadrao(pd.tintas,x.id)))}).join('')+'</div>'+
      '</section>'+
      '<section class="bloco"><h2>Sugestão de pintura completa</h2><div class="duas">'+
        campo('p-sug','Sugerir a partir de (% do preço da completa)',b.sugerir_completa,pd.sugerir_completa)+
      '</div><p class="dica">Quando as peças marcadas somarem esse tanto do preço da pintura completa, a calculadora sugere trocar.</p></section>'+
      '<p class="erro" id="e-geral" role="alert" hidden></p>'+
      '<div class="barra-salvar"><span class="dica" id="sujo" hidden>Alterações não salvas</span>'+
        '<button class="btn claro" type="button" id="p-padrao">Voltar aos valores iniciais</button>'+
        '<button class="btn primario" type="submit" id="p-salvar">Salvar preços</button></div>'+
      '</form>';
    app.innerHTML=html;
    var f=document.getElementById('f-precos');
    function marcarPadrao(){
      f.querySelectorAll('input[data-padrao]').forEach(function(i){
        var dif=i.value!=='' && +i.value!==+i.dataset.padrao; i.parentNode.querySelector('.padrao').hidden=!dif; i.classList.toggle('mudado',dif);
      });
    }
    marcarPadrao();
    f.addEventListener('input',function(){ document.getElementById('sujo').hidden=false; marcarPadrao(); });
    f.addEventListener('change',function(){ document.getElementById('sujo').hidden=false; });
    document.getElementById('p-padrao').addEventListener('click',function(){
      desenharPrecos(cb, JSON.parse(JSON.stringify(pd)));
      document.getElementById('sujo').hidden=false; aviso('Valores iniciais colocados. Salve para valer.');
    });
    f.addEventListener('submit',function(ev){
      ev.preventDefault();
      var erros={}, n=function(id){ var v=document.getElementById(id).value; if(v===''||!isFinite(+v)){ erros[id]='Preencha com um número.'; return 0; } return +v; };
      var nova={hora:n('p-hora'), horas_dia:n('p-dia'), reserva:n('p-res'), troca:document.getElementById('p-troca').checked, sugerir_completa:n('p-sug'),
        servicos:b.servicos.map(function(s){
          var x={id:s.id, material:n('m-'+s.id), horas:n('h-'+s.id), mercado_min:null, mercado_max:null};
          if(s.mercado_min!=null){ x.mercado_min=n('lo-'+s.id); x.mercado_max=n('hi-'+s.id); }
          return x; }),
        portes:b.portes.map(function(x,i){ return {id:x.id, fator:i===0?1:1+n('f-'+x.id)/100}; }),
        tintas:b.tintas.map(function(x,i){ return {id:x.id, fator:i===0?1:1+n('f-'+x.id)/100}; })};
      if(mostrarErros(erros)) return;
      var bt=document.getElementById('p-salvar'); bt.disabled=true; bt.textContent='Salvando…';
      api('PUT','/painel/calculadora',nova).then(function(resp){
        basesCache=Promise.resolve(resp); aviso('Preços salvos'); desenharPrecos(resp, resp.bases);
        // a calculadora avulsa passa a usar os custos novos (mantém os serviços marcados)
        if(selAvulsa){ selAvulsa.hora=resp.bases.hora; selAvulsa.horas_dia=resp.bases.horas_dia; selAvulsa.reserva=resp.bases.reserva; selAvulsa.troca=resp.bases.troca; }
      }).catch(function(e){
        bt.disabled=false; bt.textContent='Salvar preços';
        if(e&&e.erros){ // nomes do servidor -> campos da tela
          var m={hora:'p-hora',horas_dia:'p-dia',reserva:'p-res',sugerir_completa:'p-sug'}, x={};
          Object.keys(e.erros).forEach(function(k){
            var id=m[k]||k.replace(/^material_/,'m-').replace(/^horas_/,'h-').replace(/^fator_/,'f-').replace(/^mercado_/,'mercado-');
            x[id]=e.erros[k]; });
          mostrarErros(x);
        } else falhou(e);
      });
    });
    function mostrarErros(erros){
      f.querySelectorAll('.erro').forEach(function(el){ el.hidden=true; });
      f.querySelectorAll('.invalido').forEach(function(el){ el.classList.remove('invalido'); });
      Object.keys(erros).forEach(function(id){
        var el=document.getElementById('e-'+id), inp=document.getElementById(id);
        if(el){ el.textContent=erros[id]; el.hidden=false; } if(inp) inp.classList.add('invalido');
      });
      var tem=Object.keys(erros).length, g=document.getElementById('e-geral'); g.hidden=!tem; g.textContent='Confira os campos marcados.';
      if(tem){ var pr=f.querySelector('.erro:not([hidden])'); if(pr) pr.scrollIntoView({block:'center'}); }
      return tem;
    }
  }

  /* ---------- rotas ---------- */
  function rota(){
    var h=location.hash||'#/';
    var m=h.match(/^#\/p\/([A-Za-z0-9-]+)$/);
    if(m) return telaPedido(m[1].toUpperCase());
    if(h==='#/novo') return telaNovo();
    var c=h.match(/^#\/calc(?:\/([A-Za-z0-9-]+))?$/);
    if(c) return telaCalc(c[1]?c[1].toUpperCase():null);
    if(h==='#/precos') return telaPrecos();
    return telaLista();
  }
  window.addEventListener('hashchange',rota);
  api('GET','/painel/sessao').then(rota).catch(function(e){ if(!(e&&e.tratado)) falhou(e); });
})();

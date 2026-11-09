/* Painel Barão: lista de pedidos por etapa, detalhe do pedido e cadastro manual.
   Telas trocadas pelo endereço: #/ (lista), #/p/RC-00001 (pedido), #/novo (novo pedido). */
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
    document.getElementById('sair').hidden=true;
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
    document.getElementById('sair').hidden=false;
    app.innerHTML='<p class="carregando">Carregando pedidos…</p>';
    var fechado = filtro==='finalizado'||filtro==='cancelado';
    api('GET', fechado ? '/painel/pedidos?status='+filtro+'&limite=100' : '/painel/pedidos?abertos=1').then(function(r){
      var lista=r.pedidos||[];
      var cont={}; if(!fechado) lista.forEach(function(p){cont[p.status]=(cont[p.status]||0)+1});
      var chips=[{id:'todos',nome:'Todos',n:fechado?null:lista.length}].concat(ABERTAS.map(function(e){return {id:e.id,nome:e.nome,n:fechado?null:(cont[e.id]||0)}}))
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
    document.getElementById('sair').hidden=false;
    app.innerHTML='<p class="carregando">Carregando pedido…</p>';
    api('GET','/painel/pedidos/'+encodeURIComponent(numero)).then(function(p){
      var et=etapa(p.status), prox=proxima(p.status);
      var primeiroNome=(p.cliente||'').split(' ')[0];
      var html=
        '<a class="link voltar" href="#/">← Pedidos</a>'+
        '<div class="cab" data-s="'+esc(p.status)+'">'+
          '<h1>'+esc(p.cliente)+'</h1>'+
          '<div class="meta"><span class="status">'+esc(et.nome)+'</span><span>'+esc(p.numero)+'</span><span>'+esc(haQuanto(p.atualizado_em))+' nesta etapa</span></div>'+
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

        // orçamento
        '<form class="bloco" id="f-dados" novalidate><h2>Orçamento e contato</h2>'+
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
    document.getElementById('sair').hidden=false;
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

  /* ---------- rotas ---------- */
  function rota(){
    var h=location.hash||'#/';
    var m=h.match(/^#\/p\/([A-Za-z0-9-]+)$/);
    if(m) return telaPedido(m[1].toUpperCase());
    if(h==='#/novo') return telaNovo();
    return telaLista();
  }
  window.addEventListener('hashchange',rota);
  api('GET','/painel/sessao').then(rota).catch(function(e){ if(!(e&&e.tratado)) falhou(e); });
})();

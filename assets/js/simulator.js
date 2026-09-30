(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const defaultNames = ['Corte','Preparação','Costura','Montagem','Colagem / Prensagem','Acabamento / Revisão'];
  const demoCaps = [650,580,460,480,600,550];

  function uid() { return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function newStage(name='Nova etapa') {
    return { id:uid(), name, location:'internal', inputMode:'direct', directCapacity:'', cycleTime:'', cycleUnit:'seconds', pairsPerCycle:'1', stations:'1', extraStops:'0', customSchedule:false, customHours:'', customBreaks:'0', externalCapacity:'' };
  }

  const state = {
    step:1, meta:'', hours:'', breaks:'', selectedCapacityIndex:0,
    stages:defaultNames.map(newStage), scenario:null, pendingScenario:null
  };

  const el = {
    meta:$('#meta'), hours:$('#hours'), breaks:$('#breaks'), schedule:$('#schedule-preview'),
    stepLabel:$('#wizard-step-label'), progressText:$('#wizard-progress-text'), progressBar:$('#wizard-progress-bar'),
    back:$('#wizard-back'), next:$('#wizard-next'), validation:$('#wizard-validation'),
    stageEditor:$('#stage-editor'), addStage:$('#add-stage'), capNav:$('#capacity-stage-nav'), capEditor:$('#capacity-stage-editor'), capCounter:$('#capacity-counter'),
    review:$('#review-content'), results:$('#results-content'), loadExample:$('#load-example'),
    previewStages:$('#preview-stages'), previewStatus:$('#preview-status'), previewSummary:$('#preview-summary'), previewTitle:$('#preview-title'),
    onboarding:$('#onboarding'), onboardKicker:$('[data-onboarding-kicker]'), onboardTitle:$('[data-onboarding-title]'), onboardText:$('[data-onboarding-text]'), onboardDots:$('#onboarding-dots'), onboardNext:$('#onboarding-next'), onboardSkip:$('#onboarding-skip'), reopenOnboarding:$('#reopen-onboarding'),
    scenarioModal:$('#scenario-modal'), scenarioModalContent:$('#scenario-modal-content'), scenarioApply:$('#scenario-apply'), toast:$('#toast')
  };

  const onboardingSlides = [
    {k:'BEM-VINDO AO MOLDAR',t:'Você não vai preencher um formulário gigante.',x:'A análise é dividida em 5 passos. Em cada tela aparece só o que você precisa decidir naquele momento.'},
    {k:'A MINI FÁBRICA',t:'O fluxo vai ganhando forma enquanto você preenche.',x:'A área visual acompanha as etapas e mostra quando uma capacidade já foi informada, quando está abaixo da meta e onde vale olhar.'},
    {k:'NO FINAL',t:'O resultado vira uma conversa, não só um número.',x:'Você vê capacidade da linha, quanto falta para a meta, quais etapas precisam de atenção, três pontos para conferir na fábrica e pode testar um cenário “E se?” sem perder o original.'}
  ];
  let onboardingIndex = 0;

  const parse = v => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(',','.'));
    return Number.isFinite(n) ? n : null;
  };
  const fmt = (v, digits=1) => Number.isFinite(v) ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits}).format(v) : '—';
  const esc = v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const metaValue = () => parse(state.meta);
  const globalMinutes = () => {
    const h=parse(state.hours), b=parse(state.breaks); if(h===null||b===null) return null;
    const m=h*60-b; return m>0?m:null;
  };

  function stageMinutes(stage){
    let minutes=globalMinutes();
    if(stage.customSchedule){
      const h=parse(stage.customHours), b=parse(stage.customBreaks); if(h===null||b===null) return null;
      minutes=h*60-b;
    }
    if(minutes===null) return null;
    const stops=parse(stage.extraStops) ?? 0;
    return Math.max(0,minutes-stops);
  }
  function internalCapacity(stage, stationsOverride=null){
    if(stage.inputMode==='direct') return parse(stage.directCapacity);
    const available=stageMinutes(stage), t=parse(stage.cycleTime), q=parse(stage.pairsPerCycle), n=stationsOverride ?? parse(stage.stations);
    if(available===null||t===null||q===null||n===null||t<=0||q<=0||n<=0) return null;
    const cycleMinutes=stage.cycleUnit==='seconds'?t/60:t;
    return cycleMinutes>0?(available/cycleMinutes)*q*n:null;
  }
  function stageCapacity(stage){
    if(stage.location==='external') return parse(stage.externalCapacity);
    const internal=internalCapacity(stage);
    if(stage.location==='internal') return internal;
    const external=parse(stage.externalCapacity);
    return internal!==null&&external!==null?internal+external:null;
  }
  function baseCapacities(){return state.stages.map(stageCapacity)}
  function activeCapacities(){
    const caps=baseCapacities();
    if(state.scenario && Number.isFinite(state.scenario.newCapacity)) caps[state.scenario.stageIndex]=state.scenario.newCapacity;
    return caps;
  }
  function analysis(caps=activeCapacities()){
    const meta=metaValue(); if(meta===null||caps.some(v=>v===null)) return null;
    const line=Math.min(...caps); const below=caps.map((c,i)=>({i,c,deficit:Math.max(0,meta-c)})).filter(x=>x.deficit>0).sort((a,b)=>a.c-b.c);
    const minIndexes=caps.map((c,i)=>c===line?i:-1).filter(i=>i>=0);
    return {meta,line,gap:line-meta,below,minIndexes,allMeet:below.length===0};
  }
  function classify(caps){
    const meta=metaValue(); if(meta===null) return caps.map(()=> 'pending');
    const complete=caps.filter(v=>v!==null);
    const allComplete=caps.every(v=>v!==null);
    const anyLow=complete.some(c=>c<meta);
    const minComplete=complete.length?Math.min(...complete):null;
    return caps.map(c=>c===null?'pending':c<meta?'low':(allComplete&&!anyLow&&c===minComplete)?'tight':'ok');
  }
  const completeCount = () => baseCapacities().filter(v=>v!==null).length;

  function stageSymbol(name){
    const n=name.toLowerCase();
    if(n.includes('corte')) return '✂';
    if(n.includes('cost')) return '≈';
    if(n.includes('mont')) return '◒';
    if(n.includes('cola')||n.includes('ades')) return '◇';
    if(n.includes('acab')||n.includes('revis')) return '✦';
    if(n.includes('prep')) return '≋';
    return '◆';
  }

  function setValidation(messages=[]){
    el.validation.hidden=!messages.length;
    el.validation.innerHTML=messages.length?`<strong>Antes de continuar:</strong><ul>${messages.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>`:'';
  }
  function validate(step){
    const out=[];
    if(step===1){
      const m=parse(state.meta),h=parse(state.hours),b=parse(state.breaks);
      if(m===null||m<=0) out.push('Informe uma meta diária maior que zero.');
      if(h===null||h<=0||h>24) out.push('Informe quantas horas a produção trabalha por dia.');
      if(b===null||b<0) out.push('Informe o tempo total de intervalos.');
      if(h!==null&&b!==null&&b>=h*60) out.push('Os intervalos não podem ocupar toda a jornada.');
    }
    if(step===2){
      if(state.stages.length<2) out.push('Use pelo menos duas etapas para comparar um fluxo.');
      if(state.stages.some(s=>!s.name.trim())) out.push('Todas as etapas precisam ter um nome.');
    }
    if(step===3){ state.stages.forEach(s=>{if(stageCapacity(s)===null) out.push(`Complete os dados de “${s.name}”.`);}); }
    return out;
  }

  function updateSchedule(){
    state.meta=el.meta.value; state.hours=el.hours.value; state.breaks=el.breaks.value;
    const mins=globalMinutes(), meta=metaValue();
    if(mins&&meta){
      const paceSeconds=(mins*60)/meta;
      el.schedule.innerHTML=`<span class="insight-icon" aria-hidden="true">✓</span><div><small>Tempo disponível: <b>${fmt(mins/60,2)} h/dia</b></small><strong>Para bater ${fmt(meta,0)} pares/dia, precisa sair em média 1 par a cada ${fmt(paceSeconds,0)} segundos.</strong></div>`;
    }else{
      el.schedule.innerHTML='<span class="insight-icon" aria-hidden="true">↳</span><div><small>O Moldar calcula aqui</small><strong>Preencha os campos para ver o tempo disponível e o ritmo necessário.</strong></div>';
    }
    updatePreview();
  }

  function renderStep(){
    $$('[data-step-panel]').forEach(panel=>{
      const active=Number(panel.dataset.stepPanel)===state.step;
      panel.hidden=!active; panel.classList.toggle('is-active',active);
    });
    const labels=['Meta e jornada','Seu fluxo','Capacidade das etapas','Revisão','Resultado'];
    el.stepLabel.textContent=`Passo ${state.step} de 5 · ${labels[state.step-1]}`;
    const percent=state.step*20; el.progressText.textContent=`${percent}%`; el.progressBar.style.width=`${percent}%`;
    $$('.wizard-progress-step').forEach(btn=>{const s=Number(btn.dataset.progressStep);btn.classList.toggle('is-active',s===state.step);btn.classList.toggle('is-done',s<state.step);});
    el.back.hidden=state.step===1; el.next.hidden=state.step===5; el.next.textContent=state.step===4?'Ver meu resultado →':'Continuar →';
    $('.simulator-shell')?.classList.toggle('is-result',state.step===5);
    setValidation([]);
    if(state.step===2) renderStageEditor();
    if(state.step===3) renderCapacityStep();
    if(state.step===4) renderReview();
    if(state.step===5) renderResults();
    updatePreview();
    if(!reduced) window.scrollTo({top:0,behavior:'smooth'}); else window.scrollTo(0,0);
  }
  function go(step){state.step=Math.max(1,Math.min(5,step));renderStep()}

  function renderStageEditor(){
    el.stageEditor.innerHTML=state.stages.map((s,i)=>`<div class="stage-edit-row" data-id="${s.id}"><span class="stage-index">${String(i+1).padStart(2,'0')}</span><span class="stage-symbol" aria-hidden="true">${stageSymbol(s.name)}</span><input class="input" type="text" maxlength="48" value="${esc(s.name)}" data-action="rename" aria-label="Nome da etapa ${i+1}"><div class="stage-row-actions"><button class="icon-button" type="button" data-action="up" aria-label="Mover ${esc(s.name)} para cima" ${i===0?'disabled':''}>↑</button><button class="icon-button" type="button" data-action="down" aria-label="Mover ${esc(s.name)} para baixo" ${i===state.stages.length-1?'disabled':''}>↓</button><button class="icon-button danger-button" type="button" data-action="remove" aria-label="Excluir ${esc(s.name)}" ${state.stages.length<=2?'disabled':''}>×</button></div></div>`).join('');
  }

  function refreshCapacityNav(){
    const caps=baseCapacities();
    el.capCounter.textContent=`${completeCount()} de ${state.stages.length} completas`;
    el.capNav.innerHTML=state.stages.map((s,i)=>`<button class="capacity-nav-item ${i===state.selectedCapacityIndex?'is-active':''} ${caps[i]!==null?'is-complete':''}" type="button" data-cap-index="${i}"><span class="capacity-status">${caps[i]!==null?'✓':i+1}</span><b>${esc(s.name)}</b><small>${caps[i]!==null?`${fmt(caps[i],0)}/dia`:'falta informar'}</small></button>`).join('');
  }
  function refreshCapacityLive(){
    refreshCapacityNav();
    const s=state.stages[state.selectedCapacityIndex];
    const cap=stageCapacity(s);
    const box=$('.capacity-live',el.capEditor);
    if(box){
      const strong=$('strong',box), note=$('span',box);
      if(strong) strong.textContent=cap===null?'—':`${fmt(cap,0)} pares/dia`;
      if(note) note.textContent=cap===null?'Preencha os dados acima.':capacityMessage(cap);
    }
    updatePreview();
  }
  function renderCapacityStep(){
    const caps=baseCapacities(); const states=classify(caps); state.selectedCapacityIndex=Math.min(state.selectedCapacityIndex,state.stages.length-1);
    refreshCapacityNav();
    renderCapacityEditor(state.selectedCapacityIndex,states[state.selectedCapacityIndex]);
  }

  function renderCapacityEditor(index,status){
    const s=state.stages[index]; const cap=stageCapacity(s); const internalNeeded=s.location!=='external'; const externalNeeded=s.location!=='internal';
    el.capEditor.innerHTML=`
      <div class="capacity-editor-head"><div><span class="eyebrow">ETAPA ${index+1} DE ${state.stages.length}</span><h3>${esc(s.name)}</h3><small>Informe apenas o que fizer sentido para esta etapa.</small></div><span class="tip-pill">${status==='pending'?'Falta informar':status==='low'?'Abaixo da meta':'Etapa completa'}</span></div>
      <label class="field"><span>Onde essa etapa é feita?</span></label>
      <div class="location-segments" role="group" aria-label="Local da etapa">
        ${segment('location','internal','Aqui na fábrica','Equipe / máquina própria',s.location)}
        ${segment('location','external','Em atelier / terceiro','Capacidade entregue para você',s.location)}
        ${segment('location','mixed','Parte aqui e parte fora','Duas capacidades em paralelo',s.location)}
      </div>
      ${internalNeeded?`
        <label class="field"><span>Como é mais fácil informar a parte feita aqui?</span></label>
        <div class="mode-segments" role="group" aria-label="Forma de informar capacidade">
          ${segment('mode','direct','Sei quantos pares fazemos','Ex.: o setor faz 450 pares/dia',s.inputMode)}
          ${segment('mode','cycle','Sei o tempo da operação','Tempo + pares por ciclo + postos',s.inputMode)}
        </div>
        ${s.inputMode==='direct'?`<label class="field"><span>Em um dia normal, essa etapa faz:</span><div class="input-with-unit"><input class="input" data-field="directCapacity" type="number" min="0" step="1" inputmode="decimal" value="${esc(s.directCapacity)}" placeholder="Ex.: 450"><span>pares/dia</span></div><small>Use uma média que represente a rotina atual. Se perdas já aparecem nesse número, não desconte de novo.</small></label>`:cycleFields(s)}
      `:''}
      ${externalNeeded?`<div class="editor-divider"></div><label class="field"><span>${s.location==='mixed'?'Capacidade da parte feita fora':'Quantos pares/dia esse atelier consegue entregar para você nesta etapa?'}</span><div class="input-with-unit"><input class="input" data-field="externalCapacity" type="number" min="0" step="1" inputmode="decimal" value="${esc(s.externalCapacity)}" placeholder="Ex.: 250"><span>pares/dia</span></div><small>Informe a capacidade disponível para esta produção, no mesmo período diário.</small></label>`:''}
      <div class="capacity-live"><div><small>Capacidade estimada desta etapa</small><strong>${cap===null?'—':`${fmt(cap,0)} pares/dia`}</strong></div><span>${cap===null?'Preencha os dados acima.':capacityMessage(cap)}</span></div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn btn-secondary btn-small" type="button" data-action="next-capacity">${index===state.stages.length-1?'Concluir etapas':'Salvar e ir para a próxima →'}</button></div>`;
  }
  function segment(kind,value,title,small,current){return `<button class="segment ${current===value?'is-selected':''}" type="button" data-segment="${kind}" data-value="${value}"><strong>${title}</strong><small>${small}</small></button>`}
  function cycleFields(s){return `<div class="field-grid three"><label class="field"><span>Tempo de um ciclo</span><div class="input-with-unit"><input class="input" data-field="cycleTime" type="number" min="0.01" step="0.01" value="${esc(s.cycleTime)}" placeholder="Ex.: 45"><select class="select" data-field="cycleUnit" aria-label="Unidade do tempo"><option value="seconds" ${s.cycleUnit==='seconds'?'selected':''}>segundos</option><option value="minutes" ${s.cycleUnit==='minutes'?'selected':''}>minutos</option></select></div></label><label class="field"><span>Pares que saem por ciclo</span><input class="input" data-field="pairsPerCycle" type="number" min="0.01" step="0.01" value="${esc(s.pairsPerCycle)}"></label><label class="field"><span>Postos iguais em paralelo</span><input class="input" data-field="stations" type="number" min="1" step="1" value="${esc(s.stations)}"><small>Pessoa, pessoa + máquina ou máquina fazendo a mesma operação.</small></label></div><details class="advanced-box"><summary>Mais detalhes desta etapa</summary><div class="advanced-fields field-grid two"><label class="field"><span>Outras paradas no dia</span><div class="input-with-unit"><input class="input" data-field="extraStops" type="number" min="0" step="1" value="${esc(s.extraStops)}"><span>min</span></div><small>Além dos intervalos gerais.</small></label><label class="field"><span>Horário diferente das demais?</span><select class="select" data-field="customSchedule"><option value="false" ${!s.customSchedule?'selected':''}>Não, usa o horário geral</option><option value="true" ${s.customSchedule?'selected':''}>Sim</option></select></label>${s.customSchedule?`<label class="field"><span>Horas desta etapa</span><input class="input" data-field="customHours" type="number" min=".25" max="24" step=".25" value="${esc(s.customHours)}"></label><label class="field"><span>Intervalos desta etapa</span><div class="input-with-unit"><input class="input" data-field="customBreaks" type="number" min="0" step="1" value="${esc(s.customBreaks)}"><span>min</span></div></label>`:''}</div></details>`}
  function capacityMessage(cap){const m=metaValue();if(m===null)return 'Capacidade calculada com os dados informados.';if(cap<m)return `Para a meta atual, faltam aproximadamente ${fmt(m-cap,0)} pares/dia nesta etapa.`;return `Para a meta atual, sobram aproximadamente ${fmt(cap-m,0)} pares/dia de capacidade.`}

  function renderReview(){
    const mins=globalMinutes(), caps=baseCapacities();
    el.review.innerHTML=`<div class="review-top"><div class="review-metric"><small>Meta</small><strong>${fmt(metaValue(),0)} pares/dia</strong></div><div class="review-metric"><small>Tempo disponível</small><strong>${mins?fmt(mins/60,2):'—'} h/dia</strong></div><div class="review-metric"><small>Etapas</small><strong>${state.stages.length}</strong></div></div><div class="review-list">${state.stages.map((s,i)=>`<div class="review-row"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(s.name)}</strong><small>${locationLabel(s.location)}</small></div><b>${caps[i]===null?'—':`${fmt(caps[i],0)} pares/dia`}</b><button type="button" data-review-edit="${i}">Editar</button></div>`).join('')}</div><div class="review-note"><strong>Antes de calcular:</strong> o resultado será uma estimativa baseada nesses números. Filas, lotes, retrabalho, variações de produto e paradas não informadas podem mudar o comportamento real da linha.</div>`;
  }

  function locationLabel(v){return v==='external'?'Atelier / terceiro':v==='mixed'?'Parte aqui e parte fora':'Aqui na fábrica'}

  function resultStageBasis(stage){
    if(stage.location==='external') return 'capacidade diária informada pelo atelier';
    if(stage.location==='mixed') return stage.inputMode==='cycle' ? 'capacidade interna calculada + atelier informado' : 'capacidade interna informada + atelier informado';
    return stage.inputMode==='cycle' ? 'capacidade calculada por ciclo e postos' : 'capacidade diária informada';
  }

  function resultChecks(a,caps){
    const mainIndex=a.minIndexes[0], main=state.stages[mainIndex], mainCap=caps[mainIndex];
    const otherBelow=a.below.filter(x=>!a.minIndexes.includes(x.i));
    const checks=[];
    if(main.location==='external'){
      checks.push({title:`Confirme a entrega de ${main.name}`,text:`Use uma capacidade diária que o atelier realmente consegue entregar para esta produção, no mesmo ritmo da fábrica. Evite transformar um lote semanal em média diária se a entrega acontece em blocos.`});
    }else if(main.location==='mixed'){
      checks.push({title:`Confirme se as duas capacidades podem ser somadas`,text:`Em ${main.name}, a parte interna e a parte feita fora só somam quando realmente executam a mesma etapa em volumes paralelos. Se uma depende da outra em sequência, trate como etapas separadas.`});
    }else if(main.inputMode==='cycle'){
      checks.push({title:`Valide tempo e postos de ${main.name}`,text:`O cálculo usou tempo por ciclo e postos em paralelo. Confira se os postos realmente conseguem trabalhar ao mesmo tempo e se o tempo informado representa uma condição normal de operação.`});
    }else{
      checks.push({title:`Confirme os ${fmt(mainCap,0)} pares/dia de ${main.name}`,text:`Veja se esse número representa um dia normal — e não o melhor dia, um dia com hora extra ou um dia com mix de produto muito diferente.`});
    }
    if(otherBelow.length){
      const next=otherBelow[0], s=state.stages[next.i];
      checks.push({title:`Não olhe só para ${main.name}`,text:`${s.name} também está abaixo da meta: ${fmt(caps[next.i],0)} pares/dia, uma diferença de ${fmt(next.deficit,0)}. Mesmo melhorando ${main.name}, esta etapa ainda pode segurar a linha.`});
    }else if(a.allMeet){
      checks.push({title:'A meta atual cabe no papel',text:`Todas as etapas atendem a ${fmt(a.meta,0)} pares/dia. ${a.minIndexes.map(i=>state.stages[i].name).join(' e ')} tem a menor folga e merece acompanhamento se a meta subir ou a capacidade cair.`});
    }else{
      checks.push({title:'Observe o que não entrou na conta',text:'Filas, espera por material, troca de modelo, retrabalho, falta de pessoas e paradas não informadas podem fazer a produção real ficar abaixo da capacidade estimada.'});
    }
    checks.push({title:'Teste antes de mexer na operação',text:`Use o “E se?” para alterar ${main.name} e veja se a capacidade da linha realmente sobe ou se outro setor passa a limitar o fluxo.`});
    return checks;
  }

  function renderResults(){
    const caps=activeCapacities(), a=analysis(caps); if(!a){el.results.innerHTML='<div class="empty-state"><h2>Faltam dados para calcular.</h2><p>Volte e complete todas as etapas.</p></div>';return;}
    const states=classify(caps);
    const criticalNames=a.minIndexes.map(i=>state.stages[i].name).join(' e ');
    const mainIndex=a.minIndexes[0];
    const otherBelow=a.below.filter(x=>!a.minIndexes.includes(x.i));
    const maxScale=Math.max(a.meta,...caps);
    const metaPct=Math.max(0,Math.min(100,(a.meta/maxScale)*100));
    const checks=resultChecks(a,caps);
    const headline=a.allMeet?'Pelos dados informados, sua linha tem capacidade para a meta.':'Pelos dados informados, a linha ainda não chega à meta.';
    const supporting=a.allMeet
      ? `${criticalNames} é a etapa com menor folga: ${fmt(a.line-a.meta,0)} pares/dia acima da meta.`
      : `A capacidade estimada da linha fica em ${fmt(a.line,0)} pares/dia. ${criticalNames} aparece como primeiro ponto para conferir.`;

    const requiredHtml=a.allMeet
      ? `<article class="required-card is-clear"><span>Nenhum ganho mínimo necessário</span><strong>Meta atendida</strong><small>A menor folga atual é de ${fmt(a.line-a.meta,0)} pares/dia em ${esc(criticalNames)}.</small></article>`
      : a.below.map(x=>`<article class="required-card ${a.minIndexes.includes(x.i)?'is-main':''}"><span>${esc(state.stages[x.i].name)}</span><strong>+${fmt(x.deficit,0)} <small>pares/dia</small></strong><p>É o ganho mínimo de capacidade para esta etapa chegar à meta de ${fmt(a.meta,0)}/dia.</p></article>`).join('');

    const practicalTitle=a.allMeet
      ? `No cenário atual, as etapas informadas conseguem sustentar ${fmt(a.meta,0)} pares/dia.`
      : `Para a linha ter capacidade teórica de ${fmt(a.meta,0)} pares/dia, ${a.below.length===1?'uma etapa precisa':'estas etapas precisam'} chegar pelo menos à meta.`;
    const practicalText=a.allMeet
      ? `Isso não quer dizer que a produção real será sempre ${fmt(a.meta,0)}. Significa apenas que, pela capacidade informada, nenhuma etapa está abaixo da meta neste momento.`
      : `Isso não é uma ordem para contratar gente ou comprar máquina. É um mapa de onde os números precisam ser conferidos antes de decidir qualquer mudança.`;

    let scenarioComparison='';
    if(state.scenario){
      const baseCaps=baseCapacities(), baseA=analysis(baseCaps);
      if(baseA){
        const baseNames=baseA.minIndexes.map(i=>state.stages[i].name).join(' e ');
        const lineGain=a.line-baseA.line;
        const changed=state.scenario.stageIndex;
        const stageGain=caps[changed]-baseCaps[changed];
        scenarioComparison=`<section class="result-scenario-compare"><div class="compare-title"><div><span class="eyebrow">CENÁRIO ATIVO</span><h3>O que mudou de verdade na linha?</h3></div><button class="text-button" type="button" data-reset-scenario>Voltar ao cenário original</button></div><div class="compare-grid"><article><small>Etapa alterada</small><strong>${esc(state.stages[changed].name)}</strong><span>${fmt(baseCaps[changed],0)} → ${fmt(caps[changed],0)} /dia <b>${stageGain>=0?'+':''}${fmt(stageGain,0)}</b></span></article><article><small>Capacidade da linha</small><strong>${fmt(baseA.line,0)} → ${fmt(a.line,0)} /dia</strong><span>${lineGain>0?`ganho de ${fmt(lineGain,0)} pares/dia`:lineGain===0?'a linha não ganhou capacidade':`queda de ${fmt(Math.abs(lineGain),0)} pares/dia`}</span></article><article><small>Ponto mais apertado</small><strong>${esc(baseNames)} → ${esc(criticalNames)}</strong><span>${baseNames===criticalNames?'permanece no mesmo ponto':'a limitação mudou de lugar'}</span></article></div><p class="compare-explain">${lineGain>0?`A etapa alterada ganhou ${fmt(stageGain,0)} pares/dia, mas a linha ganhou ${fmt(lineGain,0)}. O restante ficou “preso” nas capacidades das outras etapas.`:'A mudança nessa etapa não elevou a capacidade final da linha porque outra etapa já limitava o fluxo.'}</p></section>`;
      }
    }

    el.results.innerHTML=`
      <div class="result-hero">
        <div><span class="result-kicker">LEITURA DA SUA SIMULAÇÃO</span><h2>${headline}</h2><p>${supporting}</p></div>
        <div class="result-metrics">
          <div class="result-metric"><small>Sua meta</small><strong>${fmt(a.meta,0)}</strong><span>pares/dia</span></div>
          <div class="result-metric"><small>Capacidade da linha</small><strong>${fmt(a.line,0)}</strong><span>pares/dia</span></div>
          <div class="result-metric ${a.gap<0?'negative':'positive'}"><small>${a.gap<0?'Faltam':'Folga'}</small><strong>${a.gap<0?fmt(Math.abs(a.gap),0):fmt(a.gap,0)}</strong><span>pares/dia</span></div>
        </div>
      </div>

      ${scenarioComparison}

      <section class="result-practical">
        <div class="result-practical-head"><span class="eyebrow">O QUE ISSO QUER DIZER?</span><h3>${practicalTitle}</h3><p>${practicalText}</p></div>
        <div class="required-grid">${requiredHtml}</div>
      </section>

      <section class="result-section">
        <div class="result-section-head"><div><span class="eyebrow">MAPA DA LINHA</span><h3>Capacidade de cada etapa contra a meta</h3><p>A linha vertical no medidor representa sua meta de ${fmt(a.meta,0)} pares/dia.</p></div></div>
        <div class="result-flow">${state.stages.map((s,i)=>{
          const diff=caps[i]-a.meta;
          const capPct=Math.max(2,Math.min(100,(caps[i]/maxScale)*100));
          const status=diff<0?`Faltam ${fmt(Math.abs(diff),0)}`:diff===0?'Na meta':`Folga ${fmt(diff,0)}`;
          return `<article class="result-stage ${states[i]} ${a.minIndexes.includes(i)&&!a.allMeet?'critical':''}"><div class="result-stage-top"><span>${String(i+1).padStart(2,'0')}</span><em>${diff<0?'Abaixo da meta':states[i]==='tight'?'Menor folga':'Atende'}</em></div><div><strong>${esc(s.name)}</strong><small>${locationLabel(s.location)} · ${resultStageBasis(s)}</small></div><div class="result-stage-number"><b>${fmt(caps[i],0)}</b><small>pares/dia</small><i class="${diff<0?'neg':'pos'}">${status}</i></div><div class="capacity-meter" aria-label="${esc(s.name)}: ${fmt(caps[i],0)} pares por dia; meta ${fmt(a.meta,0)}"><span class="capacity-fill" style="width:${capPct}%"></span><i class="capacity-goal" style="left:${metaPct}%"></i></div></article>`;
        }).join('')}</div>
        <div class="result-attention"><div class="attention-card primary"><span>Primeiro ponto para conferir</span><strong>${criticalNames}</strong><small>${a.allMeet?'É a menor folga da linha, não um gargalo confirmado.':`Capacidade estimada: ${fmt(a.line,0)} pares/dia.`}</small></div><div class="attention-card"><span>${otherBelow.length?'Outras etapas abaixo da meta':'Leitura complementar'}</span><strong>${otherBelow.length?otherBelow.map(x=>`${state.stages[x.i].name}: faltam ${fmt(x.deficit,0)}/dia`).join(' · '):(a.allMeet?'Nenhuma etapa está abaixo da meta informada.':'Nenhuma outra etapa abaixo da meta.')}</strong></div></div>
      </section>

      <section class="result-next">
        <div class="result-section-head"><div><span class="eyebrow">ANTES DE MEXER NA FÁBRICA</span><h3>Três coisas para conferir na operação</h3><p>O Moldar não decide por você. Ele organiza o que vale validar primeiro.</p></div></div>
        <div class="next-check-grid">${checks.map((c,i)=>`<article class="next-check"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(c.title)}</strong><p>${esc(c.text)}</p></div></article>`).join('')}</div>
      </section>

      <section class="scenario-lab"><div><span class="eyebrow">E SE?</span><h3>Agora teste uma mudança e veja se a linha realmente melhora.</h3><p>O cenário não apaga seus dados originais. A ideia é descobrir se a mudança aumenta a capacidade final ou apenas desloca o ponto mais apertado.</p></div><div class="scenario-controls"><label class="field" style="color:#fff"><span>Etapa para testar</span><select class="select" id="scenario-stage-select">${state.stages.map((s,i)=>`<option value="${i}" ${i===mainIndex?'selected':''}>${esc(s.name)} · ${fmt(caps[i],0)}/dia</option>`).join('')}</select></label><div id="scenario-actions"></div></div></section>

      <section class="result-limit-note"><div><span>LEMBRETE</span><strong>Este resultado é uma leitura de capacidade, não uma promessa de produção.</strong></div><p>Filas, lotes, sequência de modelos, retrabalho, falta de material, absenteísmo e paradas não informadas podem mudar o comportamento real da linha.</p></section>

      <div class="result-actions"><button class="btn btn-secondary" type="button" data-copy-summary>Copiar resumo e próximos passos</button><button class="btn btn-secondary" type="button" data-edit-simulation>Editar simulação</button><a class="btn btn-primary" href="../diagnostico/index.html">Revisar este caso com mais detalhe</a></div>`;
    renderScenarioActions(mainIndex);
    updatePreview();
  }

  function renderScenarioActions(index){
    const holder=$('#scenario-actions'); if(!holder)return; const s=state.stages[index]; const base=baseCapacities()[index];
    const canPlus=s.location!=='external'&&s.inputMode==='cycle'&&parse(s.stations)!==null;
    holder.innerHTML=`${canPlus?`<button class="scenario-action" type="button" data-scenario-type="plus" data-stage-index="${index}"><div><strong>+1 posto em ${esc(s.name)}</strong><small>O Moldar recalcula porque conhece tempo e postos.</small></div><span>→</span></button>`:''}<button class="scenario-action" type="button" data-scenario-type="manual" data-stage-index="${index}"><div><strong>Informar outra capacidade</strong><small>Use quando você já tem uma estimativa do novo cenário.</small></div><span>→</span></button>${s.location!=='internal'?`<button class="scenario-action" type="button" data-scenario-type="external" data-stage-index="${index}"><div><strong>Alterar capacidade do atelier</strong><small>Teste outro volume entregue para esta etapa.</small></div><span>→</span></button>`:''}${!canPlus?`<div class="scenario-active-banner"><span>Por que não aparece “+1 posto”?</span><strong>Esta etapa foi informada por capacidade total. Sem tempo/postos, o Moldar não presume ganho linear.</strong></div>`:''}`;
  }

  function plusStationCapacity(index){
    const s=state.stages[index]; const n=parse(s.stations); if(n===null)return null;
    const internal=internalCapacity(s,n+1); if(internal===null)return null;
    if(s.location==='mixed'){const ext=parse(s.externalCapacity);return ext===null?null:internal+ext;}
    return internal;
  }

  function openScenario(type,index){
    const caps=activeCapacities(), beforeStage=caps[index], beforeLine=Math.min(...caps), s=state.stages[index];
    let newCapacity=null,label='';
    if(type==='plus'){newCapacity=plusStationCapacity(index); label=`+1 posto em ${s.name}`;}
    if(type==='external'){
      label=`Nova capacidade do atelier em ${s.name}`;
      el.scenarioModalContent.innerHTML=scenarioManualMarkup(index,beforeStage,'external');
      state.pendingScenario={type,index,beforeStage,beforeLine,newCapacity:null,label};
      openScenarioModal(); bindScenarioManual(index,'external'); return;
    }
    if(type==='manual'){
      label=`Nova capacidade informada em ${s.name}`;
      el.scenarioModalContent.innerHTML=scenarioManualMarkup(index,beforeStage,'manual');
      state.pendingScenario={type,index,beforeStage,beforeLine,newCapacity:null,label};
      openScenarioModal(); bindScenarioManual(index,'manual'); return;
    }
    if(newCapacity===null)return;
    const nextCaps=caps.slice(); nextCaps[index]=newCapacity; const nextLine=Math.min(...nextCaps); const nextMin=nextCaps.map((c,i)=>c===nextLine?i:-1).filter(i=>i>=0).map(i=>state.stages[i].name).join(' e ');
    state.pendingScenario={type,index,beforeStage,beforeLine,newCapacity,label,nextLine,nextMin};
    el.scenarioModalContent.innerHTML=scenarioExplanation(s.name,beforeStage,newCapacity,beforeLine,nextLine,nextMin);
    el.scenarioApply.disabled=false; openScenarioModal();
  }
  function scenarioManualMarkup(index,beforeStage,type){
    const s=state.stages[index]; const currentExternal=parse(s.externalCapacity); return `<p>${type==='external'?`Informe qual capacidade o atelier passaria a entregar para <b>${esc(s.name)}</b>.`:`Informe qual seria a capacidade total estimada de <b>${esc(s.name)}</b> nesse novo cenário.`}</p><div class="scenario-manual-field"><label class="field"><span>${type==='external'?'Nova capacidade do atelier':'Nova capacidade da etapa'}</span><div class="input-with-unit"><input class="input" id="scenario-manual-input" type="number" min="0" step="1" placeholder="${type==='external'?(currentExternal??''):fmt(beforeStage,0)}"><span>pares/dia</span></div></label></div><div id="scenario-manual-preview" class="scenario-modal-summary"><div><small>Capacidade atual da etapa</small><strong>${fmt(beforeStage,0)}</strong><span>pares/dia</span></div><div><small>Novo cenário</small><strong>—</strong><span>pares/dia</span></div><div><small>Capacidade da linha</small><strong>—</strong><span>pares/dia</span></div></div>`;
  }
  function bindScenarioManual(index,type){
    const input=$('#scenario-manual-input'),preview=$('#scenario-manual-preview'); el.scenarioApply.disabled=true;
    input.addEventListener('input',()=>{
      const entered=parse(input.value); if(entered===null||entered<0){el.scenarioApply.disabled=true;return;}
      let total=entered; const s=state.stages[index];
      if(type==='external'&&s.location==='mixed'){const internal=internalCapacity(s); if(internal===null){el.scenarioApply.disabled=true;return;} total=internal+entered;}
      const caps=activeCapacities(); caps[index]=total; const line=Math.min(...caps); const nextMin=caps.map((c,i)=>c===line?i:-1).filter(i=>i>=0).map(i=>state.stages[i].name).join(' e ');
      state.pendingScenario={...state.pendingScenario,newCapacity:total,nextLine:line,nextMin,label:type==='external'?`Atelier de ${s.name}: ${fmt(entered,0)} pares/dia`:`${s.name}: ${fmt(total,0)} pares/dia`};
      preview.children[1].querySelector('strong').textContent=fmt(total,0); preview.children[2].querySelector('strong').textContent=fmt(line,0); el.scenarioApply.disabled=false;
    });
  }
  function scenarioExplanation(name,beforeStage,newStage,beforeLine,newLine,nextMin){
    const stageGain=newStage-beforeStage,lineGain=newLine-beforeLine; return `<div class="scenario-modal-summary"><div><small>${esc(name)}</small><strong>${fmt(beforeStage,0)} → ${fmt(newStage,0)}</strong><span>${stageGain>=0?'+':''}${fmt(stageGain,0)} pares/dia</span></div><div><small>Capacidade da linha</small><strong>${fmt(beforeLine,0)} → ${fmt(newLine,0)}</strong><span>${lineGain>=0?'+':''}${fmt(lineGain,0)} pares/dia</span></div><div><small>Novo ponto mais apertado</small><strong>${esc(nextMin)}</strong><span>menor capacidade do cenário</span></div></div><div class="scenario-modal-copy"><p><b>O que mudou:</b> ${esc(name)} ganhou capacidade no cenário.</p><p><b>O efeito na linha:</b> a linha ${lineGain>0?`ganha aproximadamente ${fmt(lineGain,0)} pares/dia`:'não ganha capacidade adicional'}, porque as outras etapas continuam limitando o fluxo.</p><p><b>Como interpretar:</b> melhorar uma etapa isoladamente pode deslocar a limitação para outra.</p></div>`;
  }
  function openScenarioModal(){el.scenarioModal.hidden=false;document.body.classList.add('modal-open');setTimeout(()=>el.scenarioApply.focus(),0)}
  function closeScenarioModal(){el.scenarioModal.hidden=true;document.body.classList.remove('modal-open');state.pendingScenario=null}
  function applyPendingScenario(){const p=state.pendingScenario;if(!p||!Number.isFinite(p.newCapacity))return;state.scenario={stageIndex:p.index,newCapacity:p.newCapacity,label:p.label};closeScenarioModal();renderResults();showToast('Cenário aplicado. O cenário original continua disponível.');}

  function updatePreview(){
    const caps=activeCapacities(),states=classify(caps),complete=baseCapacities().filter(v=>v!==null).length,mins=globalMinutes();
    el.previewStages.innerHTML=state.stages.map((s,i)=>`<article class="preview-stage ${states[i]==='low'?'is-low':states[i]==='tight'?'is-tight':caps[i]!==null?'is-complete':''} ${state.step===3&&i===state.selectedCapacityIndex?'is-current':''}"><strong>${esc(s.name)}</strong><small>${caps[i]===null?'aguardando dados':`${fmt(caps[i],0)} pares/dia`}</small></article>`).join('');
    if(state.step===1){el.previewTitle.textContent='Comece pela meta';el.previewStatus.innerHTML='<small>PASSO 1</small><strong>Defina a meta e o tempo disponível.</strong>';}
    if(state.step===2){el.previewTitle.textContent='Monte o caminho do par';el.previewStatus.innerHTML='<small>PASSO 2</small><strong>As etapas aparecem aqui na mesma ordem do seu fluxo.</strong>';}
    if(state.step===3){const s=state.stages[state.selectedCapacityIndex],cap=caps[state.selectedCapacityIndex];el.previewTitle.textContent=`Preenchendo ${s?.name||''}`;el.previewStatus.innerHTML=`<small>PASSO 3</small><strong>${cap===null?'Informe a capacidade desta etapa.':`${fmt(cap,0)} pares/dia estimados nesta etapa.`}</strong>`;}
    if(state.step===4){el.previewTitle.textContent='Pronto para revisar';el.previewStatus.innerHTML='<small>PASSO 4</small><strong>Confira os números antes de calcular a linha.</strong>';}
    if(state.step===5){const a=analysis(caps);el.previewTitle.textContent='Resultado da linha';el.previewStatus.innerHTML=a?`<small>${a.allMeet?'META ATENDIDA PELOS DADOS':'PRIMEIRO PONTO PARA INVESTIGAR'}</small><strong>${a.allMeet?`${a.minIndexes.map(i=>state.stages[i].name).join(' e ')} tem a menor folga.`:`${a.minIndexes.map(i=>state.stages[i].name).join(' e ')} limita a capacidade estimada em ${fmt(a.line,0)}/dia.`}</strong>`:'<small>RESULTADO</small><strong>Complete os dados para calcular.</strong>';}
    const summary=el.previewSummary.children;summary[0].querySelector('strong').textContent=metaValue()?`${fmt(metaValue(),0)}/dia`:'—';summary[1].querySelector('strong').textContent=mins?`${fmt(mins/60,2)} h`:'—';summary[2].querySelector('strong').textContent=`${complete}/${state.stages.length}`;
  }

  function showToast(text){el.toast.textContent=text;el.toast.hidden=false;clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.toast.hidden=true,2400)}
  function copyText(text){
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);
    return new Promise((resolve,reject)=>{const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')?resolve():reject();}catch(e){reject(e)}finally{ta.remove()}});
  }
  function buildSummary(){const caps=activeCapacities(),a=analysis(caps);if(!a)return'';const checks=resultChecks(a,caps);const below=a.below.length?a.below.map(x=>`${state.stages[x.i].name}: faltam ${fmt(x.deficit,0)} pares/dia`).join(' | '):'Nenhuma etapa abaixo da meta';return [`Resumo — Moldar`,`Meta: ${fmt(a.meta,0)} pares/dia`,`Capacidade estimada da linha: ${fmt(a.line,0)} pares/dia`,a.gap<0?`Faltam: ${fmt(Math.abs(a.gap),0)} pares/dia`:`Folga estimada: ${fmt(a.gap,0)} pares/dia`,`Primeiro ponto para conferir: ${a.minIndexes.map(i=>state.stages[i].name).join(' e ')}`,`Etapas abaixo da meta: ${below}`,`Primeiro próximo passo: ${checks[0]?.title||'Validar os dados informados'}`,state.scenario?`Cenário ativo: ${state.scenario.label}`:'Cenário: original',`Observação: estimativa baseada nos dados informados; condições não informadas podem alterar a produção real.`].join('\n')}

  function loadExample(){
    state.meta='500';state.hours='8';state.breaks='60';el.meta.value=state.meta;el.hours.value=state.hours;el.breaks.value=state.breaks;
    state.stages=defaultNames.map((name,i)=>{const s=newStage(name);s.directCapacity=String(demoCaps[i]);return s;});state.selectedCapacityIndex=0;state.scenario=null;updateSchedule();go(4);showToast('Exemplo demonstrativo carregado.');
  }

  /* Events */
  [el.meta,el.hours,el.breaks].forEach(input=>input.addEventListener('input',updateSchedule));
  el.next.addEventListener('click',()=>{const messages=validate(state.step);if(messages.length){setValidation(messages);return;}go(state.step+1)});
  el.back.addEventListener('click',()=>go(state.step-1));
  el.loadExample.addEventListener('click',loadExample);
  el.addStage.addEventListener('click',()=>{state.stages.push(newStage());renderStageEditor();updatePreview();});
  el.stageEditor.addEventListener('input',e=>{const row=e.target.closest('[data-id]');if(!row)return;const s=state.stages.find(x=>x.id===row.dataset.id);if(e.target.dataset.action==='rename'){s.name=e.target.value;updatePreview();}});
  el.stageEditor.addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;const row=btn.closest('[data-id]'),i=state.stages.findIndex(x=>x.id===row.dataset.id);if(i<0)return;const action=btn.dataset.action;if(action==='up'&&i>0)[state.stages[i-1],state.stages[i]]=[state.stages[i],state.stages[i-1]];if(action==='down'&&i<state.stages.length-1)[state.stages[i+1],state.stages[i]]=[state.stages[i],state.stages[i+1]];if(action==='remove'&&state.stages.length>2)state.stages.splice(i,1);renderStageEditor();updatePreview();});
  el.capNav.addEventListener('click',e=>{const btn=e.target.closest('[data-cap-index]');if(!btn)return;state.selectedCapacityIndex=Number(btn.dataset.capIndex);renderCapacityStep();updatePreview();});
  el.capEditor.addEventListener('click',e=>{
    const seg=e.target.closest('[data-segment]');if(seg){const s=state.stages[state.selectedCapacityIndex];if(seg.dataset.segment==='location')s.location=seg.dataset.value;if(seg.dataset.segment==='mode')s.inputMode=seg.dataset.value;renderCapacityStep();updatePreview();return;}
    const next=e.target.closest('[data-action="next-capacity"]');if(next){const s=state.stages[state.selectedCapacityIndex];if(stageCapacity(s)===null){setValidation([`Complete os dados de “${s.name}” antes de seguir.`]);return;}setValidation([]);if(state.selectedCapacityIndex<state.stages.length-1){state.selectedCapacityIndex++;renderCapacityStep();updatePreview();}else{showToast('Todas as etapas foram percorridas.');}return;}
  });
  el.capEditor.addEventListener('input',e=>{const f=e.target.dataset.field;if(!f)return;const s=state.stages[state.selectedCapacityIndex];s[f]=e.target.value;refreshCapacityLive();});
  el.capEditor.addEventListener('change',e=>{const f=e.target.dataset.field;if(!f)return;const s=state.stages[state.selectedCapacityIndex];s[f]=f==='customSchedule'?e.target.value==='true':e.target.value;if(f==='customSchedule')renderCapacityStep();else refreshCapacityLive();});
  el.review.addEventListener('click',e=>{const btn=e.target.closest('[data-review-edit]');if(!btn)return;state.selectedCapacityIndex=Number(btn.dataset.reviewEdit);go(3);});
  el.results.addEventListener('change',e=>{if(e.target.id==='scenario-stage-select')renderScenarioActions(Number(e.target.value));});
  el.results.addEventListener('click',e=>{
    const scenario=e.target.closest('[data-scenario-type]');if(scenario){openScenario(scenario.dataset.scenarioType,Number(scenario.dataset.stageIndex));return;}
    if(e.target.closest('[data-reset-scenario]')){state.scenario=null;renderResults();showToast('Cenário original restaurado.');return;}
    if(e.target.closest('[data-copy-summary]')){copyText(buildSummary()).then(()=>showToast('Resumo copiado ✓'),()=>showToast('Não foi possível copiar'));return;}
    if(e.target.closest('[data-edit-simulation]')){state.scenario=null;go(1);return;}
  });
  $$('[data-scenario-close]',el.scenarioModal).forEach(x=>x.addEventListener('click',closeScenarioModal));
  el.scenarioApply.addEventListener('click',applyPendingScenario);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el.scenarioModal.hidden)closeScenarioModal();});

  /* onboarding */
  function renderOnboarding(){const d=onboardingSlides[onboardingIndex];el.onboardKicker.textContent=d.k;el.onboardTitle.textContent=d.t;el.onboardText.textContent=d.x;el.onboardDots.innerHTML=onboardingSlides.map((_,i)=>`<span class="${i===onboardingIndex?'is-active':''}"></span>`).join('');el.onboardNext.textContent=onboardingIndex===onboardingSlides.length-1?'Começar':'Próximo';}
  function openOnboarding(){onboardingIndex=0;renderOnboarding();el.onboarding.hidden=false;document.body.classList.add('modal-open');}
  function closeOnboarding(){el.onboarding.hidden=true;document.body.classList.remove('modal-open');}
  el.onboardNext.addEventListener('click',()=>{if(onboardingIndex<onboardingSlides.length-1){onboardingIndex++;renderOnboarding()}else closeOnboarding()});
  el.onboardSkip.addEventListener('click',closeOnboarding);el.reopenOnboarding.addEventListener('click',openOnboarding);

  updateSchedule();renderStep();setTimeout(openOnboarding,280);
})();

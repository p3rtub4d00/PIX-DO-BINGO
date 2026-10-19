document.addEventListener('DOMContentLoaded',()=>{
  const plansGrid=document.getElementById('plans-admin-grid');
  const planForm=document.getElementById('plan-form');
  const adsList=document.getElementById('ads-list');
  let plans=[],ads=[],filter='all';

  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>v?new Date(v).toLocaleDateString('pt-BR'):'--';
  const statusLabel={pending_payment:'Aguardando PIX',awaiting_upload:'Aguardando arte',pending_approval:'Aguardando aprovação',active:'Ativo',paused:'Pausado',expired:'Expirado',rejected:'Rejeitado'};

  async function api(url,options={}){
    const r=await fetch(url,{headers:{'Accept':'application/json',...(options.headers||{})},...options});
    const d=await r.json().catch(()=>({}));
    if(r.status===403){location.href='/admin/login.html';throw new Error('Sessão expirada')}
    if(!r.ok||d.success===false)throw new Error(d.message||'Erro na operação');
    return d;
  }

  async function loadPlans(){
    const d=await api('/admin/ads/plans');
    plans=d.plans||[];
    plansGrid.innerHTML=plans.map(p=>`
      <article class="admin-plan-card ${p.ativo?'':'disabled'}">
        <div><span>${p.dias} dias</span><h3>${p.nome}</h3></div>
        <strong>${money(p.preco)}</strong>
        <small>${p.segundos_exibicao}s • até ${p.max_imagens} imagem(ns)</small>
        <button type="button" data-edit-plan="${p._id}">Editar</button>
      </article>`).join('')||'<p>Nenhum plano.</p>';
    plansGrid.querySelectorAll('[data-edit-plan]').forEach(b=>b.onclick=()=>openPlan(b.dataset.editPlan));
  }

  function openPlan(id=''){
    const p=plans.find(x=>String(x._id)===String(id));
    document.getElementById('plan-id').value=p?._id||'';
    document.getElementById('plan-name').value=p?.nome||'';
    document.getElementById('plan-days').value=p?.dias||30;
    document.getElementById('plan-price').value=p?.preco||0;
    document.getElementById('plan-seconds').value=p?.segundos_exibicao||10;
    document.getElementById('plan-images').value=p?.max_imagens||1;
    document.getElementById('plan-active').checked=p?p.ativo!==false:true;
    planForm.classList.remove('hidden');
    planForm.scrollIntoView({behavior:'smooth',block:'center'});
  }
  document.getElementById('btn-new-plan').onclick=()=>openPlan();
  document.getElementById('btn-cancel-plan').onclick=()=>planForm.classList.add('hidden');
  planForm.onsubmit=async e=>{
    e.preventDefault();
    const payload={
      id:document.getElementById('plan-id').value||undefined,
      nome:document.getElementById('plan-name').value,
      dias:Number(document.getElementById('plan-days').value),
      preco:Number(document.getElementById('plan-price').value),
      segundosExibicao:Number(document.getElementById('plan-seconds').value),
      maxImagens:Number(document.getElementById('plan-images').value),
      ativo:document.getElementById('plan-active').checked
    };
    try{await api('/admin/ads/plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});planForm.classList.add('hidden');await loadPlans()}catch(err){alert(err.message)}
  };

  function renderAds(){
    const shown=ads.filter(a=>filter==='all'||a.status===filter);
    adsList.innerHTML=shown.map(a=>{
      const img=a.imagens?.[0]?.data||'';
      return `<article class="ad-admin-card">
        <div class="ad-thumb">${img?`<img src="${img}" alt="">`:'<i class="fa-regular fa-image"></i>'}</div>
        <div class="ad-info">
          <div class="ad-title-row"><div><span class="status-badge st-${a.status}">${statusLabel[a.status]||a.status}</span><h3>${escapeHtml(a.empresa)}</h3></div><strong>${a.plano_nome||a.duracao_dias+' dias'}</strong></div>
          <div class="ad-meta"><span><b>Contato:</b> ${escapeHtml(a.responsavel||'--')}</span><span><b>WhatsApp:</b> ${escapeHtml(a.whatsapp||'--')}</span><span><b>Valor:</b> ${money(a.valor_pago)}</span><span><b>Impressões:</b> ${Number(a.impressoes||0)}</span><span><b>Início:</b> ${date(a.data_inicio)}</span><span><b>Fim:</b> ${date(a.data_fim)}</span></div>
          <div class="ad-actions">
            ${a.status==='pending_approval'?button('approve',a._id,'Aprovar','ok')+button('reject',a._id,'Rejeitar','danger'):''}
            ${a.status==='active'?button('pause',a._id,'Pausar',''):''}
            ${a.status==='paused'?button('resume',a._id,'Reativar','ok'):''}
            ${['active','paused','expired'].includes(a.status)?`<button data-extend="${a._id}">+ dias</button>`:''}
            <button data-delete="${a._id}" class="danger">Excluir</button>
          </div>
        </div>
      </article>`
    }).join('')||'<p class="empty-ads">Nenhum anúncio neste filtro.</p>';

    adsList.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>changeStatus(b.dataset.id,b.dataset.action));
    adsList.querySelectorAll('[data-extend]').forEach(b=>b.onclick=()=>extendAd(b.dataset.extend));
    adsList.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteAd(b.dataset.delete));
  }
  function button(action,id,label,cls){return `<button data-action="${action}" data-id="${id}" class="${cls}">${label}</button>`}
  function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

  async function loadAds(){
    const d=await api('/admin/ads/list');
    ads=d.ads||[];
    document.getElementById('kpi-active').textContent=ads.filter(a=>a.status==='active').length;
    document.getElementById('kpi-pending').textContent=ads.filter(a=>a.status==='pending_approval').length;
    document.getElementById('kpi-expired').textContent=ads.filter(a=>a.status==='expired').length;
    document.getElementById('kpi-impressions').textContent=ads.reduce((n,a)=>n+Number(a.impressoes||0),0).toLocaleString('pt-BR');
    renderAds();
  }
  async function changeStatus(id,action){
    let reason='';
    if(action==='reject'){reason=prompt('Motivo da rejeição:','Material precisa ser ajustado.')||'Material não aprovado.'}
    try{await api(`/admin/ads/${id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,reason})});await loadAds()}catch(e){alert(e.message)}
  }
  async function extendAd(id){
    const days=Number(prompt('Quantos dias deseja adicionar?','30'));if(!days)return;
    try{await api(`/admin/ads/${id}/extend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days})});await loadAds()}catch(e){alert(e.message)}
  }
  async function deleteAd(id){
    if(!confirm('Excluir este anúncio definitivamente?'))return;
    try{await api(`/admin/ads/${id}`,{method:'DELETE'});await loadAds()}catch(e){alert(e.message)}
  }

  document.querySelectorAll('.ads-filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.ads-filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');filter=b.dataset.filter;renderAds()});
  document.getElementById('btn-refresh-ads').onclick=loadAds;

  function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({nome:file.name,data:r.result});r.onerror=reject;r.readAsDataURL(file)})}
  document.getElementById('manual-form').onsubmit=async e=>{
    e.preventDefault();
    const files=[...document.getElementById('manual-images').files].slice(0,3);
    if(!files.length)return alert('Selecione uma imagem.');
    if(files.some(f=>f.size>2.5*1024*1024))return alert('Cada imagem deve ter no máximo 2,5 MB.');
    try{
      const images=await Promise.all(files.map(fileData));
      await api('/admin/ads/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        empresa:document.getElementById('manual-company').value,
        responsavel:document.getElementById('manual-contact').value,
        whatsapp:document.getElementById('manual-whatsapp').value,
        dias:Number(document.getElementById('manual-days').value),
        segundosExibicao:Number(document.getElementById('manual-seconds').value),
        images
      })});
      e.target.reset();document.getElementById('manual-days').value=30;document.getElementById('manual-seconds').value=10;await loadAds();alert('Anúncio cadastrado e ativado.');
    }catch(err){alert(err.message)}
  };

  Promise.all([loadPlans(),loadAds()]).catch(e=>alert(e.message));
});
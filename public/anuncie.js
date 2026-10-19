document.addEventListener('DOMContentLoaded', () => {
  const plansGrid=document.getElementById('plans-grid');
  const checkout=document.getElementById('checkout-section');
  const selectedPlanEl=document.getElementById('selected-plan');
  const form=document.getElementById('ad-form');
  const pixSection=document.getElementById('pix-section');
  const pixImage=document.getElementById('pix-image');
  const pixCode=document.getElementById('pix-code');
  const copyPix=document.getElementById('copy-pix');
  const paymentStatus=document.getElementById('payment-status');
  const uploadSection=document.getElementById('upload-section');
  const fileInput=document.getElementById('ad-images');
  const previewGrid=document.getElementById('preview-grid');
  const uploadLimitText=document.getElementById('upload-limit-text');
  const btnUpload=document.getElementById('btn-upload');
  const doneSection=document.getElementById('done-section');
  const doneStatus=document.getElementById('done-status');

  let plans=[];
  let selectedPlan=null;
  let adId=localStorage.getItem('pix_bingo_ad_id')||'';
  let maxImages=1;
  let selectedFiles=[];
  let polling=null;

  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  async function loadPlans(){
    try{
      const r=await fetch('/api/ads/plans',{cache:'no-store'});
      const data=await r.json();
      plans=data.plans||[];
      if(!plans.length){plansGrid.innerHTML='<div class="loading-card">Nenhum plano disponível no momento.</div>';return}
      plansGrid.innerHTML=plans.map((p,i)=>`
        <article class="plan-card" data-id="${p._id}">
          <span class="plan-days">${p.dias} DIAS NO AR</span>
          <h3>${p.nome}</h3>
          <div class="price">${money(p.preco)}</div>
          <p>Até ${p.max_imagens} imagem(ns) • ${p.segundos_exibicao}s por exibição na rotação.</p>
          <button type="button">Escolher plano</button>
        </article>`).join('');
      plansGrid.querySelectorAll('.plan-card').forEach(card=>card.addEventListener('click',()=>selectPlan(card.dataset.id)));
    }catch(e){plansGrid.innerHTML='<div class="loading-card">Não foi possível carregar os planos.</div>'}
  }

  function selectPlan(id){
    selectedPlan=plans.find(p=>String(p._id)===String(id));
    if(!selectedPlan)return;
    document.querySelectorAll('.plan-card').forEach(c=>c.classList.toggle('selected',c.dataset.id===String(id)));
    selectedPlanEl.innerHTML=`<strong>${selectedPlan.nome} — ${money(selectedPlan.preco)}</strong><span>${selectedPlan.dias} dias • até ${selectedPlan.max_imagens} imagem(ns) • ${selectedPlan.segundos_exibicao}s por exibição</span>`;
    checkout.classList.remove('hidden');
    checkout.scrollIntoView({behavior:'smooth',block:'center'});
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!selectedPlan){alert('Escolha um plano.');return}
    const btn=document.getElementById('btn-generate-pix');
    btn.disabled=true;btn.textContent='Gerando PIX...';
    try{
      const payload={
        planId:selectedPlan._id,
        empresa:document.getElementById('empresa').value.trim(),
        responsavel:document.getElementById('responsavel').value.trim(),
        whatsapp:document.getElementById('whatsapp').value.trim(),
        email:document.getElementById('email').value.trim()
      };
      const r=await fetch('/api/ads/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await r.json();
      if(!r.ok||!data.success)throw new Error(data.message||'Erro ao gerar PIX');
      adId=data.adId;maxImages=Number(data.plan?.maxImagens||1);
      localStorage.setItem('pix_bingo_ad_id',adId);
      pixImage.src=`data:image/png;base64,${data.qrCodeBase64}`;
      pixCode.value=data.qrCodeCopiaCola||'';
      checkout.classList.add('hidden');pixSection.classList.remove('hidden');
      pixSection.scrollIntoView({behavior:'smooth'});
      startPolling();
    }catch(err){alert(err.message)}finally{btn.disabled=false;btn.innerHTML='GERAR PIX <i class="fa-brands fa-pix"></i>'}
  });

  copyPix.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(pixCode.value);copyPix.textContent='Copiado!';setTimeout(()=>copyPix.textContent='Copiar',1500)}catch(e){pixCode.select();document.execCommand('copy')}});

  async function checkStatus(){
    if(!adId)return;
    try{
      const r=await fetch(`/api/ads/${encodeURIComponent(adId)}/status?t=${Date.now()}`,{cache:'no-store'});
      const data=await r.json();
      if(!data.success)return;
      maxImages=Number(data.maxImages||maxImages||1);
      if(data.paymentStatus==='approved'&&['awaiting_upload','pending_approval','active'].includes(data.status)){
        if(polling){clearInterval(polling);polling=null}
        pixSection.classList.add('hidden');
        if(data.status==='awaiting_upload'){
          uploadLimitText.textContent=`Seu plano permite até ${maxImages} imagem(ns). Use JPG, PNG ou WebP, máximo 2,5 MB cada.`;
          uploadSection.classList.remove('hidden');uploadSection.scrollIntoView({behavior:'smooth'});
        }else{
          showDone(data.status,data.rejeitadoMotivo);
        }
      }else if(data.status==='rejected'){showDone(data.status,data.rejeitadoMotivo)}
      paymentStatus.textContent=data.paymentStatus==='pending'?'Aguardando pagamento...':`Pagamento: ${data.paymentStatus}`;
    }catch(e){}
  }
  function startPolling(){if(polling)clearInterval(polling);checkStatus();polling=setInterval(checkStatus,3000)}

  fileInput.addEventListener('change',()=>{
    selectedFiles=[...fileInput.files].slice(0,maxImages);
    if([...fileInput.files].length>maxImages)alert(`Seu plano permite até ${maxImages} imagem(ns).`);
    previewGrid.innerHTML='';
    selectedFiles.forEach(file=>{
      if(file.size>2.5*1024*1024){alert(`${file.name} ultrapassa 2,5 MB.`);return}
      const img=document.createElement('img');img.src=URL.createObjectURL(file);previewGrid.appendChild(img);
    });
  });

  function fileToData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({nome:file.name,data:r.result});r.onerror=reject;r.readAsDataURL(file)})}

  btnUpload.addEventListener('click',async()=>{
    const valid=selectedFiles.filter(f=>f.size<=2.5*1024*1024&&['image/jpeg','image/png','image/webp'].includes(f.type));
    if(!valid.length){alert('Selecione pelo menos uma imagem válida.');return}
    btnUpload.disabled=true;btnUpload.textContent='Enviando...';
    try{
      const images=await Promise.all(valid.map(fileToData));
      const r=await fetch(`/api/ads/${encodeURIComponent(adId)}/upload`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images})});
      const data=await r.json();if(!r.ok||!data.success)throw new Error(data.message||'Erro no envio');
      uploadSection.classList.add('hidden');showDone(data.status);
    }catch(err){alert(err.message)}finally{btnUpload.disabled=false;btnUpload.textContent='ENVIAR PARA APROVAÇÃO'}
  });

  function showDone(status,reason=''){
    doneSection.classList.remove('hidden');
    uploadSection.classList.add('hidden');pixSection.classList.add('hidden');
    const labels={pending_approval:'aguardando aprovação',active:'ativo no telão',paused:'pausado',expired:'expirado',rejected:'rejeitado'};
    doneStatus.textContent=`Status: ${labels[status]||status}${reason?' — '+reason:''}`;
  }

  loadPlans();
  if(adId)checkStatus();
});
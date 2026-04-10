async function carregarTenants() {
  const tbody = document.getElementById('tenants-body');
  tbody.innerHTML = '';
  const resp = await fetch('/master/api/tenants');
  const data = await resp.json();
  if (!resp.ok || !data.success) return;

  data.tenants.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.slug || ''}</td>
      <td>${t.nome_fantasia || ''}</td>
      <td>${t.ativo ? 'Sim' : 'Não'}</td>
      <td>${(t.domains || []).join(', ')}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('btn-salvar-tenant').addEventListener('click', async () => {
  const slug = document.getElementById('tenant-slug').value.trim();
  const nome_fantasia = document.getElementById('tenant-nome').value.trim();
  const domains = document.getElementById('tenant-domains').value.trim();
  const ativo = document.getElementById('tenant-ativo').value === 'true';
  const msg = document.getElementById('tenant-msg');
  msg.textContent = '';

  const resp = await fetch('/master/api/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, nome_fantasia, domains, ativo })
  });
  const data = await resp.json().catch(() => ({}));
  msg.textContent = resp.ok && data.success ? 'Tenant salvo com sucesso.' : (data.message || 'Erro ao salvar tenant.');
  if (resp.ok && data.success) carregarTenants();
});

document.getElementById('btn-carregar-brand').addEventListener('click', async () => {
  const slug = document.getElementById('brand-slug').value.trim();
  const msg = document.getElementById('brand-msg');
  msg.textContent = '';
  if (!slug) return;

  const resp = await fetch(`/master/api/tenant-branding/${encodeURIComponent(slug)}`);
  const data = await resp.json().catch(() => ({}));
  if (resp.ok && data.success) {
    document.getElementById('brand-nome').value = data.nome_bingo || '';
    document.getElementById('brand-fone').value = data.telefone_contato || '';
    msg.textContent = 'Branding carregado.';
  } else {
    msg.textContent = data.message || 'Erro ao carregar branding.';
  }
});

document.getElementById('btn-salvar-brand').addEventListener('click', async () => {
  const slug = document.getElementById('brand-slug').value.trim();
  const nome_bingo = document.getElementById('brand-nome').value.trim();
  const telefone_contato = document.getElementById('brand-fone').value.trim();
  const msg = document.getElementById('brand-msg');
  msg.textContent = '';
  if (!slug) return;

  const resp = await fetch(`/master/api/tenant-branding/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome_bingo, telefone_contato })
  });
  const data = await resp.json().catch(() => ({}));
  msg.textContent = resp.ok && data.success ? 'Branding salvo com sucesso.' : (data.message || 'Erro ao salvar branding.');
});

carregarTenants();

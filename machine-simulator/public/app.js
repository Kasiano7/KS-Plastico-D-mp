const pressGrid = document.querySelector('#press-grid');
const template = document.querySelector('#press-template');
const transmissionToggle = document.querySelector('#transmission-toggle');
const cards = new Map();

const statusLabels = {
  production: 'En production',
  setup: 'Réglage',
  mold_change: 'Changement moule',
  stopped: 'Arrêtée',
  fault: 'En défaut',
  maintenance: 'Maintenance',
  idle: 'Disponible',
};

async function refresh() {
  try {
    const state = await request('/api/state');
    render(state);
  } catch (error) {
    document.querySelector('#connection').dataset.status = 'error';
    document.querySelector('#connection-label').textContent = 'Simulateur hors ligne';
    document.querySelector('#connection-detail').textContent = error.message;
  }
}

function render(state) {
  renderGateway(state.gateway);
  for (const press of state.presses) renderPress(press);
}

function renderGateway(gateway) {
  const connection = document.querySelector('#connection');
  const status = !gateway.transmissionEnabled ? 'paused' : gateway.status;
  connection.dataset.status = status;
  document.querySelector('#connection-label').textContent = {
    connected: 'KS Plastico Demo connecté',
    connecting: 'Synchronisation…',
    error: 'KS Plastico Demo inaccessible',
    unconfigured: 'Configuration requise',
    paused: 'Transmission suspendue',
  }[status] || 'Connexion inconnue';
  document.querySelector('#connection-detail').textContent = gateway.message;
  document.querySelector('#last-sync').textContent = gateway.lastSuccessAt
    ? `Dernier envoi ${relativeTime(gateway.lastSuccessAt)}`
    : 'En attente du premier relevé';
  document.querySelector('#gateway-id').textContent = gateway.id;
  document.querySelector('#api-url').textContent = gateway.apiUrl;
  transmissionToggle.checked = gateway.transmissionEnabled;
}

function renderPress(press) {
  let card = cards.get(press.code);
  if (!card) {
    card = template.content.firstElementChild.cloneNode(true);
    card.dataset.code = press.code;
    card.addEventListener('click', handlePressAction);
    card.addEventListener('change', handleMoldChange);
    pressGrid.append(card);
    cards.set(press.code, card);
  }

  card.dataset.status = press.status;
  setText(card, '.press-code', `${press.code} · ${press.tonnage.toLocaleString('fr-FR')} T`);
  setText(card, '.press-name', press.name);
  setText(card, '.status-pill', statusLabels[press.status] || press.status);
  setText(card, '.reason', press.reason || (press.status === 'production' ? 'Cycle stable — aucun défaut actif' : 'En attente d’un ordre de production'));
  setText(card, '.parts', press.partsProduced.toLocaleString('fr-FR'));
  setText(card, '.rate', `${press.unitsPerHour.toLocaleString('fr-FR')} p/h`);
  setText(card, '.cycle', press.cycleTimeSeconds ? `${press.cycleTimeSeconds.toFixed(1)} s` : '—');
  setText(card, '.rejects', press.partsRejected.toLocaleString('fr-FR'));
  setText(card, '.temperature', `${press.temperatureC.toFixed(1)} °C`);
  setText(card, '.pressure', `${press.hydraulicPressureBar} bar`);
  setText(
    card,
    '.production-order',
    press.currentOrderNumber
      ? `${press.currentOrderNumber} · ${press.currentProductReference} — ${press.currentProductName}`
      : press.status === 'production'
        ? 'Création de l’OF simulé…'
        : 'Aucun OF simulé actif',
  );
  renderMoldSelect(card, press);
}

function renderMoldSelect(card, press) {
  const select = card.querySelector('.mold-select');
  const signature = press.compatibleMolds
    .map((mold) => `${mold.reference}:${mold.name}`)
    .join('|');
  if (select.dataset.options !== signature) {
    select.replaceChildren(new Option('Aucun moule', ''));
    for (const mold of press.compatibleMolds) {
      select.add(new Option(`${mold.reference} — ${mold.name}`, mold.reference));
    }
    select.dataset.options = signature;
  }
  select.value = press.currentMoldReference || '';
}

async function handleMoldChange(event) {
  const select = event.target.closest('.mold-select');
  if (!select) return;
  const card = event.currentTarget;
  select.disabled = true;
  try {
    const state = await request(`/api/presses/${card.dataset.code}/mold`, {
      method: 'POST',
      body: JSON.stringify({ moldReference: select.value || null }),
    });
    render(state);
  } finally {
    select.disabled = false;
  }
}

async function handlePressAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = event.currentTarget;
  button.disabled = true;
  try {
    const state = await request(`/api/presses/${card.dataset.code}/action`, {
      method: 'POST',
      body: JSON.stringify({ action: button.dataset.action }),
    });
    render(state);
    card.querySelector('details')?.removeAttribute('open');
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('[data-scenario]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const state = await request(`/api/scenarios/${button.dataset.scenario}`, { method: 'POST' });
      render(state);
      document.querySelector('#scenario-note').textContent =
        button.dataset.scenario === 'incident-demo'
          ? 'Scénario lancé : défaut PR-60 à 6 s, arrêt PR-59 à 14 s.'
          : `Scénario “${button.textContent.trim()}” appliqué.`;
    } finally {
      button.disabled = false;
    }
  });
});

transmissionToggle.addEventListener('change', async () => {
  const state = await request('/api/transmission', {
    method: 'POST',
    body: JSON.stringify({ enabled: transmissionToggle.checked }),
  });
  render(state);
});

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Requête impossible');
  return result;
}

function setText(parent, selector, value) {
  parent.querySelector(selector).textContent = value;
}

function relativeTime(date) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1_000));
  if (seconds < 5) return 'à l’instant';
  if (seconds < 60) return `il y a ${seconds} s`;
  return `il y a ${Math.floor(seconds / 60)} min`;
}

await refresh();
setInterval(refresh, 1_000);

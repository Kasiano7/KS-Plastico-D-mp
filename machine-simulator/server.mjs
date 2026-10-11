import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
loadLocalEnvironment(join(rootDir, '.env'));

const port = positiveInteger(process.env.PORT || process.env.SIMULATOR_PORT, 4100);
const sendIntervalMs = Math.max(positiveInteger(process.env.SIMULATOR_SEND_INTERVAL_MS, 5_000), 1_000);
const gatewayId = process.env.SIMULATOR_GATEWAY_ID || 'demo-presses-01';
const apiUrl = process.env.APP_API_URL || 'http://localhost:3000/api/passerelle/telemetrie';
const gatewaySecret = process.env.MACHINE_GATEWAY_SECRET || '';

const presses = [
  createPress('PR-59', 'Presse 59', 1_000, 32, 112, [
    { reference: 'MOU-112', name: 'Bavette anti-projection 450' },
    { reference: 'MOU-118', name: 'Support batterie' },
  ]),
  createPress('PR-60', 'Presse 60', 1_500, 22, 164, [
    { reference: 'MOU-203', name: 'Passage de roue 780' },
    { reference: 'MOU-247', name: 'Coiffe de réservoir' },
  ]),
  createPress('PR-61', 'Presse 61', 0, 26, 138, [
    { reference: 'MOU-045', name: 'Garde-boue 2 essieux' },
    { reference: 'MOU-046', name: 'Garde-boue 3 essieux' },
  ]),
];

let transmissionEnabled = true;
let scenarioTimers = [];
let connection = {
  status: gatewaySecret ? 'connecting' : 'unconfigured',
  lastAttemptAt: null,
  lastSuccessAt: null,
  message: gatewaySecret ? 'Première synchronisation en attente' : 'Secret de passerelle manquant',
  accepted: 0,
};

setInterval(tick, 1_000).unref();
setInterval(sendTelemetry, sendIntervalMs).unref();
setInterval(refreshMachineCatalog, 30_000).unref();
setTimeout(refreshMachineCatalog, 100).unref();
setTimeout(sendTelemetry, 250).unref();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/api/state') {
      return json(response, 200, publicState());
    }

    if (request.method === 'POST' && url.pathname === '/api/transmission') {
      const body = await readJson(request);
      transmissionEnabled = Boolean(body.enabled);
      if (transmissionEnabled) void sendTelemetry();
      return json(response, 200, publicState());
    }

    const actionMatch = url.pathname.match(/^\/api\/presses\/(PR-(?:59|60|61))\/action$/);
    if (request.method === 'POST' && actionMatch) {
      const body = await readJson(request);
      const press = presses.find((candidate) => candidate.code === actionMatch[1]);
      if (!press) return json(response, 404, { error: 'Presse introuvable' });
      applyAction(press, body.action, body.reason);
      void sendTelemetry();
      return json(response, 200, publicState());
    }

    const moldMatch = url.pathname.match(/^\/api\/presses\/(PR-(?:59|60|61))\/mold$/);
    if (request.method === 'POST' && moldMatch) {
      const body = await readJson(request);
      const press = presses.find((candidate) => candidate.code === moldMatch[1]);
      if (!press) return json(response, 404, { error: 'Presse introuvable' });
      const moldReference = body.moldReference === null ? null : String(body.moldReference || '');
      if (
        moldReference !== null &&
        !press.compatibleMolds.some((mold) => mold.reference === moldReference)
      ) {
        return json(response, 400, { error: 'Ce moule n’est pas compatible avec cette presse' });
      }
      press.currentMoldReference = moldReference;
      void sendTelemetry();
      return json(response, 200, publicState());
    }

    const scenarioMatch = url.pathname.match(/^\/api\/scenarios\/([a-z-]+)$/);
    if (request.method === 'POST' && scenarioMatch) {
      runScenario(scenarioMatch[1]);
      void sendTelemetry();
      return json(response, 200, publicState());
    }

    if (request.method === 'GET') return serveStatic(url.pathname, response);
    return json(response, 404, { error: 'Route introuvable' });
  } catch (error) {
    console.error(error);
    return json(response, error?.statusCode || 500, { error: error?.message || 'Erreur interne' });
  }
});

server.listen(port, () => {
  console.log(`Simulateur KS Plastico Demo prêt sur http://localhost:${port}`);
  console.log(`Destination : ${apiUrl}`);
});

function createPress(code, name, tonnage, nominalCycleTime, targetUnitsPerHour, compatibleMolds) {
  return {
    code,
    name,
    tonnage,
    nominalCycleTime,
    targetUnitsPerHour,
    compatibleMolds,
    currentMoldReference: null,
    currentOrderNumber: null,
    currentProductReference: null,
    currentProductName: null,
    status: 'idle',
    reason: null,
    partsProduced: 0,
    partsRejected: 0,
    productionCarry: 0,
    rejectRate: 0.008,
    temperatureC: 42,
    hydraulicPressureBar: 0,
    statusChangedAt: new Date().toISOString(),
  };
}

function tick() {
  for (const press of presses) {
    if (press.status === 'production') {
      press.productionCarry += press.targetUnitsPerHour / 3_600;
      const completedParts = Math.floor(press.productionCarry);
      if (completedParts > 0) {
        press.partsProduced += completedParts;
        press.productionCarry -= completedParts;
        for (let index = 0; index < completedParts; index += 1) {
          if (Math.random() < press.rejectRate) press.partsRejected += 1;
        }
      }
      press.temperatureC = approach(press.temperatureC, 67 + press.tonnage / 500, 0.08);
      press.hydraulicPressureBar = approach(press.hydraulicPressureBar, 168, 5);
    } else {
      const targetTemperature = press.status === 'fault' ? 82 : 39;
      press.temperatureC = approach(press.temperatureC, targetTemperature, 0.15);
      press.hydraulicPressureBar = approach(
        press.hydraulicPressureBar,
        press.status === 'maintenance' ? 0 : 24,
        7,
      );
    }
  }
}

function applyAction(press, action, customReason) {
  const actions = {
    production: ['production', null],
    idle: ['idle', customReason || 'Presse disponible'],
    forced_stop: ['stopped', customReason || "Arrêt d’urgence déclenché par l’opérateur"],
    hydraulic_fault: ['fault', customReason || 'Défaut pression hydraulique — seuil de sécurité dépassé'],
    overheat: ['fault', customReason || 'Surchauffe du groupe de plastification'],
    sensor_fault: ['fault', customReason || 'Capteur de fermeture moule incohérent'],
    maintenance: ['maintenance', customReason || 'Diagnostic maintenance en cours'],
    reset_counters: [press.status, press.reason],
  };
  const selected = actions[action];
  if (!selected) throw Object.assign(new Error('Action inconnue'), { statusCode: 400 });

  if (action === 'reset_counters') {
    press.partsProduced = 0;
    press.partsRejected = 0;
    press.productionCarry = 0;
    return;
  }

  if (action === 'production' && !press.currentMoldReference) {
    press.currentMoldReference = press.compatibleMolds[0]?.reference ?? null;
  }

  press.status = selected[0];
  press.reason = selected[1];
  press.statusChangedAt = new Date().toISOString();
}

function runScenario(scenario) {
  clearScenarioTimers();
  if (scenario === 'all-running') {
    for (const press of presses) applyAction(press, 'production');
    return;
  }
  if (scenario === 'quality-drift') {
    for (const press of presses) applyAction(press, 'production');
    presses[2].rejectRate = 0.22;
    presses[2].reason = 'Dérive qualité simulée : taux de rebut élevé';
    return;
  }
  if (scenario === 'incident-demo') {
    for (const press of presses) {
      press.rejectRate = 0.008;
      applyAction(press, 'production');
    }
    scenarioTimers.push(setTimeout(() => {
      applyAction(presses[1], 'hydraulic_fault');
      void sendTelemetry();
    }, 6_000));
    scenarioTimers.push(setTimeout(() => {
      applyAction(presses[0], 'forced_stop', 'Arrêt forcé après défaut matière');
      void sendTelemetry();
    }, 14_000));
    return;
  }
  if (scenario === 'reset') {
    for (const press of presses) {
      press.rejectRate = 0.008;
      applyAction(press, 'idle');
      applyAction(press, 'reset_counters');
    }
    return;
  }
  throw Object.assign(new Error('Scénario inconnu'), { statusCode: 400 });
}

async function sendTelemetry() {
  if (!transmissionEnabled || !gatewaySecret) return;
  connection = { ...connection, status: 'connecting', lastAttemptAt: new Date().toISOString() };

  const recordedAt = new Date().toISOString();
  const payload = {
    gatewayId,
    simulation: true,
    readings: presses.map((press) => telemetryFor(press, recordedAt)),
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${gatewaySecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Réponse HTTP ${response.status}`);
    for (const press of presses) {
      if (press.status !== 'production') {
        press.currentOrderNumber = null;
        press.currentProductReference = null;
        press.currentProductName = null;
      }
    }
    for (const order of result.simulatedOrders || []) {
      const press = presses.find((candidate) => candidate.code === order.machineCode);
      if (!press) continue;
      press.currentOrderNumber = order.orderNumber;
      press.currentProductReference = order.productReference;
      press.currentProductName = order.productName;
    }

    connection = {
      status: 'connected',
      lastAttemptAt: recordedAt,
      lastSuccessAt: new Date().toISOString(),
      message: `${result.accepted ?? 0} relevé(s) accepté(s)`,
      accepted: (connection.accepted || 0) + (result.accepted || 0),
    };
  } catch (error) {
    connection = {
      ...connection,
      status: 'error',
      lastAttemptAt: recordedAt,
      message: error instanceof Error ? error.message : 'Connexion impossible',
    };
  }
}

async function refreshMachineCatalog() {
  if (!gatewaySecret) return;
  const catalogUrl = new URL(apiUrl);
  for (const press of presses) catalogUrl.searchParams.append('machineCode', press.code);

  try {
    const response = await fetch(catalogUrl, {
      headers: { authorization: `Bearer ${gatewaySecret}` },
      signal: AbortSignal.timeout(4_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Réponse HTTP ${response.status}`);

    for (const machine of result.machines || []) {
      const press = presses.find((candidate) => candidate.code === machine.code);
      if (!press) continue;
      press.name = machine.name;
      press.tonnage = machine.tonnage;
      press.compatibleMolds = machine.compatibleMolds;
      press.currentMoldReference = machine.currentMoldReference;
    }
  } catch (error) {
    console.warn('Catalogue des moules indisponible :', error instanceof Error ? error.message : error);
  }
}

function telemetryFor(press, recordedAt) {
  const isProducing = press.status === 'production';
  const qualityPct = press.partsProduced > 0
    ? Math.max(0, ((press.partsProduced - press.partsRejected) / press.partsProduced) * 100)
    : 100;
  return {
    machineCode: press.code,
    recordedAt,
    status: press.status,
    cycleTimeSeconds: isProducing ? press.nominalCycleTime * (0.97 + Math.random() * 0.06) : null,
    partsProduced: press.partsProduced,
    partsRejected: press.partsRejected,
    availabilityPct: isProducing ? 100 : 0,
    performancePct: isProducing ? 97 + Math.random() * 5 : 0,
    qualityPct: round1(qualityPct),
    moldReference: press.currentMoldReference,
    reason: press.reason,
  };
}

function publicState() {
  return {
    gateway: {
      id: gatewayId,
      apiUrl,
      sendIntervalMs,
      transmissionEnabled,
      ...connection,
    },
    presses: presses.map((press) => ({
      code: press.code,
      name: press.name,
      tonnage: press.tonnage,
      status: press.status,
      reason: press.reason,
      partsProduced: press.partsProduced,
      partsRejected: press.partsRejected,
      cycleTimeSeconds: press.status === 'production' ? press.nominalCycleTime : null,
      unitsPerHour: press.status === 'production' ? press.targetUnitsPerHour : 0,
      temperatureC: round1(press.temperatureC),
      hydraulicPressureBar: Math.round(press.hydraulicPressureBar),
      compatibleMolds: press.compatibleMolds,
      currentMoldReference: press.currentMoldReference,
      currentOrderNumber: press.currentOrderNumber,
      currentProductReference: press.currentProductReference,
      currentProductName: press.currentProductName,
      statusChangedAt: press.statusChangedAt,
    })),
  };
}

async function serveStatic(pathname, response) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!['index.html', 'app.js', 'styles.css'].includes(relativePath)) {
    return json(response, 404, { error: 'Fichier introuvable' });
  }
  const filePath = join(rootDir, 'public', relativePath);
  const body = await readFile(filePath);
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  response.writeHead(200, {
    'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw Object.assign(new Error('Corps trop volumineux'), { statusCode: 413 });
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error('JSON invalide'), { statusCode: 400 });
  }
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function loadLocalEnvironment(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function approach(value, target, step) {
  if (Math.abs(target - value) <= step) return target;
  return value + Math.sign(target - value) * step;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clearScenarioTimers() {
  for (const timer of scenarioTimers) clearTimeout(timer);
  scenarioTimers = [];
}

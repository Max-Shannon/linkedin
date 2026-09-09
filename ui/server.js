const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { snapshotAll } = require('../lib/rolling-backup');

const ROOT = path.join(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.UI_PORT) || 3847;
const ENV_PATH = path.join(ROOT, '.env');
const CONNECTIONS_CSV = path.join(ROOT, 'connections.csv');
const SALES_CSV = path.join(ROOT, 'sales-connections.csv');
const ANALYTICS_HTML = path.join(ROOT, 'connections-analytics.html');

const MAX_LOG_LINES = 4000;
const sseClients = new Set();
let currentJob = null;
const logLines = [];

function cleanLogChunk(chunk) {
  return String(chunk)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\r/g, '\n');
}

function appendLog(text) {
  const pieces = cleanLogChunk(text).split('\n');
  for (const piece of pieces) {
    const line = piece.replace(/\s+$/g, '');
    if (!line && logLines[logLines.length - 1] === '') {
      continue;
    }
    logLines.push(line);
    if (logLines.length > MAX_LOG_LINES) {
      logLines.splice(0, logLines.length - MAX_LOG_LINES);
    }
    broadcast({ type: 'log', line });
  }
}

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

function csvRowCount(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return Math.max(0, lines.length - 1);
}

function readEmailFromEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    return process.env.LINKEDIN_EMAIL || '';
  }
  const match = fs.readFileSync(ENV_PATH, 'utf8').match(/^LINKEDIN_EMAIL=(.*)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

function upsertEmail(email) {
  const value = String(email || '').trim();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Enter a valid email address.');
  }

  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  if (/^LINKEDIN_EMAIL=/m.test(text)) {
    text = text.replace(/^LINKEDIN_EMAIL=.*$/m, `LINKEDIN_EMAIL=${value}`);
  } else {
    const prefix = text && !text.endsWith('\n') ? '\n' : '';
    text = `${text}${prefix}LINKEDIN_EMAIL=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, text, 'utf8');
  process.env.LINKEDIN_EMAIL = value;
  return value;
}

function jobSnapshot() {
  if (!currentJob) {
    return null;
  }
  return {
    name: currentJob.name,
    startedAt: currentJob.startedAt,
    running: true,
  };
}

function statusPayload() {
  return {
    email: readEmailFromEnv(),
    connectionsCount: csvRowCount(CONNECTIONS_CSV),
    salesCount: csvRowCount(SALES_CSV),
    analyticsExists: fs.existsSync(ANALYTICS_HTML),
    job: jobSnapshot(),
  };
}

function stopJob(signal = 'SIGTERM') {
  if (!currentJob || !currentJob.child) {
    return false;
  }
  currentJob.child.kill(signal);
  return true;
}

function startJob({ name, args, password }) {
  if (currentJob) {
    const err = new Error('A job is already running. Cancel it first.');
    err.statusCode = 409;
    throw err;
  }

  const env = { ...process.env };
  if (password) {
    env.LINKEDIN_PASSWORD = String(password);
  } else {
    delete env.LINKEDIN_PASSWORD;
  }
  env.FORCE_COLOR = '0';

  const copied = snapshotAll();
  if (copied.length) {
    appendLog(`Backup: saved ${copied.length} file(s) under .backups/`);
  }

  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  currentJob = {
    name,
    startedAt: new Date().toISOString(),
    child,
  };
  appendLog(`\n── Started ${name} ──`);
  broadcast({ type: 'job', job: jobSnapshot() });

  child.stdout.on('data', (buf) => appendLog(buf.toString('utf8')));
  child.stderr.on('data', (buf) => appendLog(buf.toString('utf8')));

  child.on('error', (err) => {
    appendLog(err.stack || err.message);
  });

  child.on('close', (code, signal) => {
    const ended = currentJob;
    currentJob = null;
    appendLog(`── ${name} finished (code ${code}${signal ? `, ${signal}` : ''}) ──`);
    broadcast({ type: 'job', job: null, exitCode: code, name: ended && ended.name });
    broadcast({ type: 'status', status: statusPayload() });
  });

  return jobSnapshot();
}

function parsePositiveInt(value, label) {
  if (value == null || value === '') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.floor(n);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (_req, res) => {
  res.json(statusPayload());
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'hello', status: statusPayload(), log: logLines.slice(-400) })}\n\n`);
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.post('/api/setup', (req, res) => {
  try {
    const email = upsertEmail(req.body && req.body.email);
    broadcast({ type: 'status', status: statusPayload() });
    res.json({ ok: true, email });
  } catch (err) {
    console.error(err.stack || err.message);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/jobs/download', (req, res) => {
  try {
    const body = req.body || {};
    const args = [path.join(ROOT, 'download-connections.js')];
    if (body.fresh) {
      args.push('--fresh');
    }
    const months = parsePositiveInt(body.months, '--months');
    if (months) {
      args.push('--months', String(months));
    }
    const limit = parsePositiveInt(body.limit, '--limit');
    if (limit) {
      args.push('--limit', String(limit));
    }
    const job = startJob({
      name: 'download',
      args,
      password: body.password,
    });
    res.json({ ok: true, job });
  } catch (err) {
    console.error(err.stack || err.message);
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.post('/api/jobs/analytics', (req, res) => {
  try {
    const job = startJob({
      name: 'analytics',
      args: [path.join(ROOT, 'generate-connections-analytics.js')],
      password: req.body && req.body.password,
    });
    res.json({ ok: true, job });
  } catch (err) {
    console.error(err.stack || err.message);
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.post('/api/jobs/remove', (req, res) => {
  try {
    const body = req.body || {};
    if (body.execute && body.confirm !== true) {
      throw new Error('Set confirm: true to execute removals.');
    }
    const args = [path.join(ROOT, 'remove-connections.js')];
    const csvChoice = body.csv === 'sales' ? SALES_CSV : CONNECTIONS_CSV;
    args.push('--csv', csvChoice);
    if (body.execute) {
      args.push('--execute');
    }
    if (body.status) {
      args.push('--status', String(body.status));
    }
    const limit = parsePositiveInt(body.limit, '--limit');
    if (limit) {
      args.push('--limit', String(limit));
    }
    const job = startJob({
      name: body.execute ? 'remove-execute' : 'remove-dry-run',
      args,
      password: body.password,
    });
    res.json({ ok: true, job });
  } catch (err) {
    console.error(err.stack || err.message);
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.post('/api/jobs/cancel', (_req, res) => {
  if (!currentJob) {
    res.status(409).json({ error: 'No job is running.' });
    return;
  }
  appendLog('Cancel requested…');
  stopJob('SIGTERM');
  setTimeout(() => {
    if (currentJob) {
      stopJob('SIGKILL');
    }
  }, 2500);
  res.json({ ok: true });
});

app.get('/analytics', (_req, res) => {
  if (!fs.existsSync(ANALYTICS_HTML)) {
    res.status(404).type('html').send(
      '<p>No analytics file yet. Generate it from the dashboard first.</p>'
    );
    return;
  }
  res.sendFile(ANALYTICS_HTML);
});

app.use((err, _req, res, _next) => {
  console.error(err.stack || err.message);
  res.status(500).json({ error: err.message || 'Server error' });
});

const server = app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`Dashboard listening on ${url} (localhost only)`);
  openBrowser(url);
});

function openBrowser(url) {
  if (process.env.UI_NO_OPEN === '1') {
    return;
  }
  const { spawn: spawnOpen } = require('child_process');
  try {
    if (process.platform === 'darwin') {
      spawnOpen('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      spawnOpen('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawnOpen('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch (err) {
    console.error(err.stack || err.message);
  }
}

function shutdown() {
  stopJob('SIGTERM');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

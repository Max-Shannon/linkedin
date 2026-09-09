const logEl = document.getElementById('log');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const tooltipEl = document.getElementById('tooltip');
let tooltipTarget = null;

function positionTooltip(target) {
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const gap = 10;
  const edge = 10;
  let top = targetRect.top - tooltipRect.height - gap;

  if (top < edge) {
    top = targetRect.bottom + gap;
  }
  top = Math.max(edge, Math.min(top, window.innerHeight - tooltipRect.height - edge));

  let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  left = Math.max(edge, Math.min(left, window.innerWidth - tooltipRect.width - edge));
  tooltipEl.style.top = `${Math.round(top)}px`;
  tooltipEl.style.left = `${Math.round(left)}px`;
}

function showTooltip(target) {
  const text = target && target.dataset.tooltip;
  if (!text) {
    return;
  }
  tooltipTarget = target;
  tooltipEl.textContent = text;
  tooltipEl.hidden = false;
  target.setAttribute('aria-describedby', 'tooltip');
  positionTooltip(target);
}

function hideTooltip(target) {
  if (target && tooltipTarget !== target) {
    return;
  }
  if (tooltipTarget && tooltipTarget.getAttribute('aria-describedby') === 'tooltip') {
    tooltipTarget.removeAttribute('aria-describedby');
  }
  tooltipTarget = null;
  tooltipEl.hidden = true;
}

document.addEventListener('pointerover', (event) => {
  const target = event.target.closest('[data-tooltip]');
  if (target && !target.contains(event.relatedTarget)) {
    showTooltip(target);
  }
});

document.addEventListener('pointerout', (event) => {
  const target = event.target.closest('[data-tooltip]');
  if (target && !target.contains(event.relatedTarget)) {
    hideTooltip(target);
  }
});

document.addEventListener('focusin', (event) => {
  const target = event.target.closest('[data-tooltip]');
  if (target) {
    showTooltip(target);
  }
});

document.addEventListener('focusout', (event) => {
  const target = event.target.closest('[data-tooltip]');
  if (target) {
    hideTooltip(target);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideTooltip();
  }
});

window.addEventListener('scroll', () => hideTooltip(), true);
window.addEventListener('resize', () => hideTooltip());

function password() {
  return passwordEl.value;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function appendLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setAnalyticsRunning(running) {
  const btn = document.getElementById('start-analytics');
  const hint = document.getElementById('analytics-status');
  btn.classList.toggle('busy', running);
  btn.textContent = running ? 'Generating…' : 'Generate dashboard';
  hint.hidden = !running;
}

function renderStatus(status) {
  if (!status) {
    return;
  }
  document.getElementById('stat-email').textContent = status.email || 'not set';
  document.getElementById('stat-csv').textContent = String(status.connectionsCount ?? 0);
  document.getElementById('stat-sales').textContent = String(status.salesCount ?? 0);
  document.getElementById('stat-job').textContent = status.job ? status.job.name : 'idle';
  if (status.email && !emailEl.value) {
    emailEl.value = status.email;
  }
  const busy = Boolean(status.job);
  const analyticsRunning = Boolean(status.job && status.job.name === 'analytics');
  document.getElementById('start-download').disabled = busy;
  document.getElementById('start-analytics').disabled = busy;
  document.getElementById('start-dry').disabled = busy;
  document.getElementById('start-execute').disabled = busy;
  document.getElementById('cancel').disabled = !busy;
  setAnalyticsRunning(analyticsRunning);
}

async function refreshStatus() {
  const response = await fetch('/api/status');
  const status = await response.json();
  renderStatus(status);
}

document.getElementById('save-email').addEventListener('click', async () => {
  try {
    await postJson('/api/setup', { email: emailEl.value });
    appendLog('Saved LINKEDIN_EMAIL to .env (password was not written).');
    await refreshStatus();
  } catch (err) {
    appendLog(err.stack || err.message);
  }
});

document.getElementById('start-download').addEventListener('click', async () => {
  try {
    await postJson('/api/jobs/download', {
      password: password(),
      months: document.getElementById('months').value,
      limit: document.getElementById('dl-limit').value,
      fresh: document.getElementById('fresh').checked,
    });
  } catch (err) {
    appendLog(err.stack || err.message);
  }
});

document.getElementById('start-analytics').addEventListener('click', async () => {
  setAnalyticsRunning(true);
  document.getElementById('start-analytics').disabled = true;
  document.getElementById('cancel').disabled = false;
  document.getElementById('stat-job').textContent = 'analytics';
  try {
    await postJson('/api/jobs/analytics', {});
  } catch (err) {
    setAnalyticsRunning(false);
    appendLog(err.stack || err.message);
    await refreshStatus();
  }
});

function removePayload(execute) {
  return {
    password: password(),
    execute,
    confirm: execute,
    csv: document.getElementById('csv-source').value,
    status: document.getElementById('status').value,
    limit: document.getElementById('rm-limit').value,
  };
}

document.getElementById('start-dry').addEventListener('click', async () => {
  try {
    await postJson('/api/jobs/remove', removePayload(false));
  } catch (err) {
    appendLog(err.stack || err.message);
  }
});

document.getElementById('start-execute').addEventListener('click', async () => {
  const ok = window.confirm(
    'This will permanently remove connections on LinkedIn. Continue?'
  );
  if (!ok) {
    return;
  }
  try {
    await postJson('/api/jobs/remove', removePayload(true));
  } catch (err) {
    appendLog(err.stack || err.message);
  }
});

document.getElementById('cancel').addEventListener('click', async () => {
  try {
    await postJson('/api/jobs/cancel', {});
  } catch (err) {
    appendLog(err.stack || err.message);
  }
});

const events = new EventSource('/api/events');
events.addEventListener('message', (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (payload.type === 'hello') {
      renderStatus(payload.status);
      if (Array.isArray(payload.log)) {
        logEl.textContent = payload.log.join('\n');
        if (payload.log.length) {
          logEl.textContent += '\n';
        }
        logEl.scrollTop = logEl.scrollHeight;
      }
      return;
    }
    if (payload.type === 'log') {
      appendLog(payload.line);
      return;
    }
    if (payload.type === 'status') {
      renderStatus(payload.status);
      return;
    }
    if (payload.type === 'job') {
      refreshStatus().catch((err) => appendLog(err.stack || err.message));
    }
  } catch (err) {
    appendLog(err.stack || err.message);
  }
});

refreshStatus().catch((err) => appendLog(err.stack || err.message));

const logEl = document.getElementById('log');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');

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
  document.getElementById('start-download').disabled = busy;
  document.getElementById('start-analytics').disabled = busy;
  document.getElementById('start-dry').disabled = busy;
  document.getElementById('start-execute').disabled = busy;
  document.getElementById('cancel').disabled = !busy;
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
  try {
    await postJson('/api/jobs/analytics', {});
  } catch (err) {
    appendLog(err.stack || err.message);
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderConnectionsAnalyticsHtml(analytics) {
  const dataJson = JSON.stringify(analytics).replace(/</g, '\\u003c');
  const generatedLabel = new Date(analytics.generatedAt).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LinkedIn Network Analytics</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg-0: #070b14;
      --bg-1: #0d1424;
      --bg-2: #121c31;
      --card: rgba(18, 28, 49, 0.72);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #edf2ff;
      --muted: #94a3b8;
      --accent: #5b9dff;
      --accent-2: #7c5cff;
      --accent-3: #22d3ee;
      --gold: #f6c177;
      --good: #34d399;
      --shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      --radius: 22px;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Manrope', system-ui, sans-serif;
      color: var(--text);
      background: var(--bg-0);
      min-height: 100vh;
      overflow-x: hidden;
    }

    .mesh {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 15% 20%, rgba(91, 157, 255, 0.22), transparent 28%),
        radial-gradient(circle at 85% 12%, rgba(124, 92, 255, 0.18), transparent 24%),
        radial-gradient(circle at 70% 78%, rgba(34, 211, 238, 0.12), transparent 30%),
        linear-gradient(180deg, #070b14 0%, #0d1424 45%, #070b14 100%);
      z-index: 0;
    }

    .wrap {
      position: relative;
      z-index: 1;
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px 24px 80px;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.3fr 0.7fr;
      gap: 24px;
      margin-bottom: 28px;
    }

    .hero-panel, .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(18px);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .hero-panel {
      padding: 36px;
      position: relative;
      overflow: hidden;
    }

    .hero-panel::after {
      content: '';
      position: absolute;
      inset: auto -10% -40% auto;
      width: 280px;
      height: 280px;
      background: radial-gradient(circle, rgba(91,157,255,0.25), transparent 70%);
      pointer-events: none;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(91, 157, 255, 0.12);
      color: #cfe3ff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      font-family: 'Fraunces', Georgia, serif;
      font-size: clamp(2.4rem, 4vw, 4rem);
      line-height: 1.02;
      margin: 18px 0 12px;
      letter-spacing: -0.03em;
    }

    .subtitle {
      color: var(--muted);
      font-size: 1.05rem;
      max-width: 56ch;
      line-height: 1.6;
      margin: 0;
    }

    .meta {
      margin-top: 18px;
      color: #b6c2d9;
      font-size: 0.92rem;
    }

    .hero-side {
      padding: 24px;
      display: grid;
      gap: 14px;
      align-content: start;
    }

    .mini-stat {
      padding: 18px 20px;
      border-radius: 18px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }

    .mini-stat .label {
      color: var(--muted);
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }

    .mini-stat .value {
      margin-top: 8px;
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: -0.03em;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      padding: 22px;
      position: relative;
      overflow: hidden;
    }

    .stat-card .label {
      color: var(--muted);
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .stat-card .value {
      margin-top: 10px;
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -0.04em;
    }

    .stat-card .hint {
      margin-top: 8px;
      color: #b9c7df;
      font-size: 0.88rem;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .card {
      padding: 22px;
    }

    .card h2 {
      margin: 0 0 6px;
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .card p.desc {
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 0.92rem;
    }

    .chart-box {
      position: relative;
      height: 320px;
    }

    .chart-box.tall { height: 360px; }
    .chart-box.compact { height: 260px; }

    .bars {
      display: grid;
      gap: 12px;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 140px 1fr 48px;
      gap: 12px;
      align-items: center;
      font-size: 0.92rem;
    }

    .bar-label {
      color: #dbe7ff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bar-track {
      height: 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
    }

    .bar-count {
      text-align: right;
      color: #cbd5e1;
      font-weight: 700;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .chip {
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      color: #dbeafe;
      font-size: 0.88rem;
      font-weight: 600;
    }

    .chip strong {
      color: var(--gold);
      margin-left: 6px;
    }

    .list {
      display: grid;
      gap: 12px;
    }

    .list-item {
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }

    .list-item .title {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .list-item .sub {
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .table-card {
      margin-top: 20px;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }

    .toolbar input, .toolbar select {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      color: var(--text);
      border-radius: 14px;
      padding: 12px 14px;
      font: inherit;
      min-width: 220px;
    }

    .toolbar input:focus, .toolbar select:focus {
      outline: 2px solid rgba(91,157,255,0.35);
      border-color: rgba(91,157,255,0.5);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }

    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      text-align: left;
      vertical-align: top;
    }

    th {
      color: #b9c7df;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    td.title-cell {
      color: #dbe7ff;
      max-width: 420px;
    }

    a {
      color: #9ec5ff;
      text-decoration: none;
    }

    a:hover { text-decoration: underline; }

    .fade-in {
      animation: fadeIn 0.7s ease both;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 1100px) {
      .hero, .grid-2, .grid-3, .stats {
        grid-template-columns: 1fr;
      }
      .bar-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      .bar-count { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="mesh"></div>
  <div class="wrap">
    <section class="hero fade-in">
      <div class="hero-panel">
        <div class="eyebrow">LinkedIn Network Intelligence</div>
        <h1>Your connection universe, mapped.</h1>
        <p class="subtitle">
          A living portrait of your professional graph — growth over time, role composition,
          company concentration, and the language of your network.
        </p>
        <div class="meta">Generated ${escapeHtml(generatedLabel)} · ${escapeHtml(
    String(analytics.summary.total)
  )} contacts analysed</div>
      </div>
      <div class="hero-panel hero-side">
        <div class="mini-stat">
          <div class="label">Peak month</div>
          <div class="value">${escapeHtml(analytics.summary.peakMonth?.label || '—')}</div>
        </div>
        <div class="mini-stat">
          <div class="label">Peak additions</div>
          <div class="value">${escapeHtml(String(analytics.summary.peakMonth?.count || 0))}</div>
        </div>
        <div class="mini-stat">
          <div class="label">Last 30 days</div>
          <div class="value">${escapeHtml(String(analytics.summary.last30Days))}</div>
        </div>
      </div>
    </section>

    <section class="stats fade-in">
      <div class="card stat-card"><div class="label">Total connections</div><div class="value" id="stat-total">${analytics.summary.total}</div><div class="hint">People in your export</div></div>
      <div class="card stat-card"><div class="label">Unique companies</div><div class="value">${analytics.summary.uniqueCompanies}</div><div class="hint">Detected from headlines</div></div>
      <div class="card stat-card"><div class="label">With connect dates</div><div class="value">${analytics.summary.datedPct}%</div><div class="hint">${analytics.summary.dated} dated profiles</div></div>
      <div class="card stat-card"><div class="label">Avg headline length</div><div class="value">${analytics.summary.avgTitleLength}</div><div class="hint">Median ${analytics.summary.medianTitleLength} chars</div></div>
    </section>

    <section class="grid-2 fade-in">
      <div class="card">
        <h2>Network growth timeline</h2>
        <p class="desc">New connections by month, based on LinkedIn "Connected on" dates.</p>
        <div class="chart-box tall"><canvas id="timelineChart"></canvas></div>
      </div>
      <div class="card">
        <h2>Seniority mix</h2>
        <p class="desc">Inferred from headline language — useful for network seniority balance.</p>
        <div class="chart-box tall"><canvas id="seniorityChart"></canvas></div>
      </div>
    </section>

    <section class="grid-3 fade-in">
      <div class="card">
        <h2>Role composition</h2>
        <p class="desc">Primary functional category per contact.</p>
        <div class="chart-box compact"><canvas id="rolesChart"></canvas></div>
      </div>
      <div class="card">
        <h2>Connections by weekday</h2>
        <p class="desc">Which days you tend to add people.</p>
        <div class="chart-box compact"><canvas id="weekdayChart"></canvas></div>
      </div>
      <div class="card">
        <h2>Headline length distribution</h2>
        <p class="desc">How verbose your network's headlines are.</p>
        <div class="chart-box compact"><canvas id="lengthChart"></canvas></div>
      </div>
    </section>

    <section class="grid-2 fade-in">
      <div class="card">
        <h2>Top companies</h2>
        <p class="desc">Most frequently mentioned organisations in headlines.</p>
        <div class="bars" id="companyBars"></div>
      </div>
      <div class="card">
        <h2>Top keywords</h2>
        <p class="desc">Dominant terms across all headlines.</p>
        <div class="chips" id="keywordChips"></div>
      </div>
    </section>

    <section class="grid-2 fade-in">
      <div class="card">
        <h2>Recently connected</h2>
        <p class="desc">Latest additions in your dataset.</p>
        <div class="list" id="recentList"></div>
      </div>
      <div class="card">
        <h2>Longest headlines</h2>
        <p class="desc">Contacts with the most elaborate LinkedIn summaries.</p>
        <div class="list" id="longTitleList"></div>
      </div>
    </section>

    <section class="card table-card fade-in">
      <h2>Explore every contact</h2>
      <p class="desc">Search and filter your full exported network.</p>
      <div class="toolbar">
        <input id="searchInput" type="search" placeholder="Search name, title, company..." />
        <select id="roleFilter"><option value="">All roles</option></select>
        <select id="seniorityFilter"><option value="">All seniority</option></select>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Role</th>
              <th>Seniority</th>
              <th>Connected</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody id="contactsBody"></tbody>
        </table>
      </div>
    </section>
  </div>

  <script>
    const DATA = ${dataJson};

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';
    Chart.defaults.font.family = 'Manrope, system-ui, sans-serif';

    const palette = ['#5b9dff', '#7c5cff', '#22d3ee', '#f6c177', '#34d399', '#fb7185', '#a78bfa', '#60a5fa', '#f472b6', '#4ade80'];

    function makeChart(id, type, labels, values, options = {}) {
      const ctx = document.getElementById(id);
      return new Chart(ctx, {
        type,
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: palette,
            borderWidth: 0,
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#5b9dff',
            borderColor: '#5b9dff',
            ...(options.dataset || {}),
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: options.legend !== false && type !== 'line' && type !== 'bar' },
          },
          scales: type === 'line' || type === 'bar' ? {
            x: { grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true, ticks: { precision: 0 } },
          } : {},
          ...(options.chart || {}),
        },
      });
    }

    makeChart(
      'timelineChart',
      'line',
      DATA.charts.timeline.map((item) => item.label),
      DATA.charts.timeline.map((item) => item.count),
      { legend: false, dataset: { backgroundColor: 'rgba(91,157,255,0.15)', borderColor: '#5b9dff' } }
    );

    makeChart(
      'seniorityChart',
      'doughnut',
      DATA.charts.seniority.map((item) => item.label),
      DATA.charts.seniority.map((item) => item.count),
      { legend: true }
    );

    makeChart(
      'rolesChart',
      'bar',
      DATA.charts.roles.map((item) => item.label),
      DATA.charts.roles.map((item) => item.count),
      { legend: false, dataset: { backgroundColor: palette, borderRadius: 8 } }
    );

    makeChart(
      'weekdayChart',
      'bar',
      DATA.charts.byWeekday.map((item) => item.label),
      DATA.charts.byWeekday.map((item) => item.count),
      { legend: false, dataset: { backgroundColor: '#22d3ee', borderRadius: 8 } }
    );

    makeChart(
      'lengthChart',
      'bar',
      DATA.charts.titleLengthBuckets.map((item) => item.label),
      DATA.charts.titleLengthBuckets.map((item) => item.count),
      { legend: false, dataset: { backgroundColor: '#f6c177', borderRadius: 8 } }
    );

    function renderBars(containerId, items) {
      const root = document.getElementById(containerId);
      const max = Math.max(...items.map((item) => item.count), 1);
      root.innerHTML = items.map((item) => \`
        <div class="bar-row">
          <div class="bar-label">\${item.label}</div>
          <div class="bar-track"><div class="bar-fill" style="width:\${(item.count / max) * 100}%"></div></div>
          <div class="bar-count">\${item.count}</div>
        </div>\`).join('');
    }

    function renderChips(containerId, items) {
      const root = document.getElementById(containerId);
      root.innerHTML = items.map((item) => \`<span class="chip">\${item.label}<strong>\${item.count}</strong></span>\`).join('');
    }

    function renderList(containerId, items, mapper) {
      document.getElementById(containerId).innerHTML = items.map(mapper).join('');
    }

    renderBars('companyBars', DATA.charts.companies);
    renderChips('keywordChips', DATA.charts.keywords.slice(0, 24));

    renderList('recentList', DATA.highlights.recent, (item) => \`
      <div class="list-item">
        <div class="title">\${item.name}</div>
        <div class="sub">\${item.title || 'No headline'} · Connected \${item.connectedOn || 'Unknown'}</div>
      </div>\`);

    renderList('longTitleList', DATA.highlights.longestTitles, (item) => \`
      <div class="list-item">
        <div class="title">\${item.name} · \${item.titleLength} chars</div>
        <div class="sub">\${item.title}</div>
      </div>\`);

    const roleFilter = document.getElementById('roleFilter');
    const seniorityFilter = document.getElementById('seniorityFilter');
    const searchInput = document.getElementById('searchInput');
    const contactsBody = document.getElementById('contactsBody');

    [...new Set(DATA.contacts.map((item) => item.role))].sort().forEach((value) => {
      roleFilter.insertAdjacentHTML('beforeend', \`<option value="\${value}">\${value}</option>\`);
    });
    [...new Set(DATA.contacts.map((item) => item.seniority))].sort().forEach((value) => {
      seniorityFilter.insertAdjacentHTML('beforeend', \`<option value="\${value}">\${value}</option>\`);
    });

    function renderTable() {
      const q = searchInput.value.trim().toLowerCase();
      const role = roleFilter.value;
      const seniority = seniorityFilter.value;
      const rows = DATA.contacts.filter((item) => {
        if (role && item.role !== role) return false;
        if (seniority && item.seniority !== seniority) return false;
        if (!q) return true;
        const haystack = [item.name, item.title, item.companies.join(' '), item.role, item.seniority].join(' ').toLowerCase();
        return haystack.includes(q);
      });

      contactsBody.innerHTML = rows.slice(0, 500).map((item) => \`
        <tr>
          <td>\${item.name}</td>
          <td class="title-cell">\${item.title || '—'}</td>
          <td>\${item.role}</td>
          <td>\${item.seniority}</td>
          <td>\${item.connectedOn || '—'}</td>
          <td><a href="\${item.profileUrl}" target="_blank" rel="noopener">Open</a></td>
        </tr>\`).join('');

      if (rows.length > 500) {
        contactsBody.insertAdjacentHTML('beforeend', \`<tr><td colspan="6">Showing first 500 of \${rows.length} matches. Refine your search to narrow results.</td></tr>\`);
      }
    }

    searchInput.addEventListener('input', renderTable);
    roleFilter.addEventListener('change', renderTable);
    seniorityFilter.addEventListener('change', renderTable);
    renderTable();
  </script>
</body>
</html>`;
}

module.exports = {
  renderConnectionsAnalyticsHtml,
};

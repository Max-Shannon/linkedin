const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const { parseConnectionsFromSduiResponse } = require('./lib/parse-sdui-connections');
const { loadConnectionsCsv } = require('./lib/connections-csv');

const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL;
const CONNECTIONS_URL =
  'https://www.linkedin.com/mynetwork/invite-connect/connections/';
const PAGER_ID = 'com.linkedin.sdui.pagers.mynetwork.connectionsList';
const SCREEN_ID = 'com.linkedin.sdui.flagshipnav.mynetwork.Connections';
const PAGINATION_ENDPOINT =
  'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination';
const MIN_REQUEST_DELAY_MS = 1000;
const MAX_REQUEST_DELAY_MS = 10000;
const DEFAULT_CONNECTIONS_PER_RUN = 5000;
const MAX_CONSECUTIVE_DUPLICATE_BATCHES = 5;

const OUTPUT_FILE = path.join(__dirname, 'connections.csv');
const STATE_FILE = path.join(__dirname, 'download-connections-state.json');
const STATE_VERSION = 2;
const PROGRESS_BAR_WIDTH = 32;

function parseCliArgs(argv) {
  const flags = new Set();
  let limit = DEFAULT_CONNECTIONS_PER_RUN;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--limit requires a number');
      }
      limit = Number(value);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error('--limit must be a positive number');
      }
      limit = Math.floor(limit);
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      flags.add(arg);
    }
  }

  return { flags, limit };
}

function createProgressReporter(initialTotal, runLimit) {
  let runNew = 0;
  let totalSaved = initialTotal;
  let status = 'Starting…';
  const interactive = Boolean(process.stdout.isTTY);

  function render() {
    if (!interactive) {
      return;
    }

    const pct = Math.min(100, (runNew / runLimit) * 100);
    const filled = Math.round((pct / 100) * PROGRESS_BAR_WIDTH);
    const bar = '█'.repeat(filled) + '░'.repeat(PROGRESS_BAR_WIDTH - filled);
    const line = `  ${bar}  ${runNew.toLocaleString()}/${runLimit.toLocaleString()} new  ·  ${totalSaved.toLocaleString()} saved  ·  ${status}`;
    process.stdout.write(`\r\x1b[K${line}`);
  }

  return {
    setStatus(nextStatus) {
      status = nextStatus;
      render();
    },
    addNew(added, total) {
      runNew += added;
      totalSaved = total;
      render();
    },
    setTotal(total) {
      totalSaved = total;
      render();
    },
    end() {
      if (interactive) {
        process.stdout.write('\n');
      }
    },
  };
}

async function sleepWithProgress(ms, progress) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  progress.setStatus(`Waiting ~${seconds}s…`);
  await sleep(ms);
}

function printRunSummary(result, runLimit) {
  const {
    connections,
    fetchedThisRun,
    hitRunLimit,
    linkedInListExhausted,
    stoppedOnDuplicates,
  } = result;

  console.log('');
  console.log('═'.repeat(62));
  console.log('  Connections download');
  console.log('═'.repeat(62));
  console.log('');
  console.log(`  Saved in CSV:     ${connections.length.toLocaleString()} connections`);
  console.log(`  New this run:     ${fetchedThisRun.toLocaleString()} connections`);
  console.log(`  Output file:      ${OUTPUT_FILE}`);
  console.log('');
  console.log(`  ── About the ${runLimit.toLocaleString()} per-run limit ──`);
  console.log('');
  console.log(`  Each run downloads up to ${runLimit.toLocaleString()} NEW connections — not ${runLimit.toLocaleString()} total.`);
  console.log('  Your CSV keeps growing across runs (e.g. 5k → 10k → 15k → …).');
  console.log('  Progress is saved automatically, so you can stop and continue anytime.');
  console.log('');

  if (linkedInListExhausted) {
    console.log('  ✓ All connections have been downloaded.');
    console.log('');
    return;
  }

  console.log('  ► Run the command again until the summary says all connections');
  console.log('    are downloaded:');
  console.log('');
  console.log('      npm run connections:download');
  console.log('');

  if (hitRunLimit) {
    console.log(`  (This run stopped because it reached the ${runLimit.toLocaleString()}-new limit.)`);
  } else if (stoppedOnDuplicates) {
    console.log('  (This run paused after detecting overlap with already-saved contacts.)');
  } else {
    console.log('  (This run stopped before finishing — run again to continue.)');
  }
  console.log('');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minMs = MIN_REQUEST_DELAY_MS, maxMs = MAX_REQUEST_DELAY_MS) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

function escapeCsv(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(rows, filePath) {
  const header = ['name', 'title', 'profile_url', 'vanity_name', 'connected_on'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [row.name, row.title, row.profileUrl, row.vanityName, row.connectedOn]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      version: STATE_VERSION,
      startIndex: 0,
      totalSaved: 0,
      completed: false,
      updatedAt: null,
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const migratedCompleted =
      Number(raw.version) < 2 && raw.completed && Number(raw.totalSaved) >= 5000
        ? false
        : Boolean(raw.completed);

    return {
      version: STATE_VERSION,
      startIndex: Number(raw.startIndex) || 0,
      totalSaved: Number(raw.totalSaved) || 0,
      completed: migratedCompleted,
      updatedAt: raw.updatedAt || null,
    };
  } catch (err) {
    console.error(err.stack || err.message);
    return {
      version: STATE_VERSION,
      startIndex: 0,
      totalSaved: 0,
      completed: false,
      updatedAt: null,
    };
  }
}

function saveState(state) {
  fs.writeFileSync(
    STATE_FILE,
    `${JSON.stringify(
      {
        version: STATE_VERSION,
        startIndex: state.startIndex,
        totalSaved: state.totalSaved,
        completed: state.completed,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function mergeConnections(existing, incoming) {
  const byVanity = new Map();
  for (const row of existing) {
    if (row.vanityName) {
      byVanity.set(row.vanityName, row);
    }
  }
  for (const row of incoming) {
    if (row.vanityName) {
      byVanity.set(row.vanityName, row);
    }
  }
  return [...byVanity.values()];
}

function makeParentSpanId() {
  return encodeURIComponent(crypto.randomBytes(8).toString('base64'));
}

function buildPaginationPayload(startIndex) {
  const requestedArguments = {
    $type: 'proto.sdui.actions.requests.RequestedArguments',
    payload: {
      startIndex,
      sortByOptionBinding: {
        key: 'connectionsListSortOption',
        namespace: 'connectionsListSortOptionMenu',
      },
    },
    requestedStateKeys: [
      {
        key: { value: { $case: 'id', id: 'connectionsListSortOption' } },
        namespace: 'connectionsListSortOptionMenu',
      },
    ],
    requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
    states: [
      {
        key: 'connectionsListSortOption',
        namespace: 'connectionsListSortOptionMenu',
        value: 'sortByRecentlyAdded',
        originalProtoCase: 'stringValue',
      },
    ],
    screenId: SCREEN_ID,
  };

  return {
    pagerId: PAGER_ID,
    clientArguments: requestedArguments,
    paginationRequest: {
      $type: 'proto.sdui.actions.requests.PaginationRequest',
      pagerId: PAGER_ID,
      requestedArguments: {
        $type: 'proto.sdui.actions.requests.RequestedArguments',
        payload: {
          startIndex,
          sortByOptionBinding: {
            key: 'connectionsListSortOption',
            namespace: 'connectionsListSortOptionMenu',
          },
        },
        requestedStateKeys: [
          {
            key: { value: { $case: 'id', id: 'connectionsListSortOption' } },
            namespace: 'connectionsListSortOptionMenu',
          },
        ],
        requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
      },
      trigger: {
        $case: 'itemDistanceTrigger',
        itemDistanceTrigger: {
          $type: 'proto.sdui.actions.requests.ItemDistanceTrigger',
          preloadDistance: 3,
          preloadLength: 250,
        },
      },
      retryCount: 2,
    },
  };
}

async function promptPassword() {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(`Password for ${LINKEDIN_EMAIL}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(password);
        return;
      }

      if (char === '\u0003') {
        process.exit(1);
      }

      if (char === '\u007f' || char === '\b') {
        password = password.slice(0, -1);
        return;
      }

      password += char;
    };

    stdin.on('data', onData);
  });
}

async function hasLinkedInSession(page) {
  const cookies = await page.cookies();
  return cookies.some((cookie) => cookie.name === 'li_at');
}

async function loginToLinkedIn(page, password) {
  await page.goto('https://www.linkedin.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForSelector('#username', { timeout: 30000 });
  await page.click('#username', { clickCount: 3 });
  await page.type('#username', LINKEDIN_EMAIL, { delay: 20 });
  await page.type('#password', password, { delay: 20 });

  await Promise.all([
    page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  if (await hasLinkedInSession(page)) {
    return;
  }

  const currentUrl = page.url();
  if (
    currentUrl.includes('/checkpoint/') ||
    currentUrl.includes('/challenge/')
  ) {
    console.log('\nComplete LinkedIn verification in the browser window…');
  }

  await page.waitForFunction(() => document.cookie.includes('li_at='), {
    timeout: 300000,
  });
}

async function ensureLoggedIn(page) {
  await page.goto(CONNECTIONS_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  if (await hasLinkedInSession(page)) {
    return;
  }

  const password = await promptPassword();
  if (!password) {
    throw new Error('Password is required.');
  }

  await loginToLinkedIn(page, password);
  await page.goto(CONNECTIONS_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
}

async function fetchConnectionsPage(page, startIndex) {
  const parentSpanId = makeParentSpanId();
  const url = `${PAGINATION_ENDPOINT}?sduiid=${encodeURIComponent(
    PAGER_ID
  )}&parentSpanId=${parentSpanId}`;
  const payload = buildPaginationPayload(startIndex);

  return page.evaluate(
    async ({ requestUrl, body }) => {
      const jsessionCookie = document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith('JSESSIONID='));
      const csrfToken = jsessionCookie
        ? jsessionCookie.substring('JSESSIONID='.length).replace(/^"|"$/g, '')
        : '';

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          'csrf-token': csrfToken,
          'x-li-rsc-stream': 'true',
          'x-li-anchor-page-key': 'd_flagship3_people_connections',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        text,
      };
    },
    { requestUrl: url, body: payload }
  );
}

async function collectAllConnections(page, state, existingConnections, progress, runLimit) {
  let allConnections = [...existingConnections];
  let startIndex = Math.max(state.startIndex, allConnections.length);
  let fetchedThisRun = 0;
  let hitRunLimit = false;
  let linkedInListExhausted = false;
  let stoppedOnDuplicates = false;
  let consecutiveDuplicateBatches = 0;

  progress.setTotal(allConnections.length);

  if (startIndex === 0) {
    progress.setStatus('Reading first page…');
    const initialHtml = await page.content();
    const initialBatch = parseConnectionsFromSduiResponse(initialHtml);
    const before = allConnections.length;
    allConnections = mergeConnections(allConnections, initialBatch);
    const added = allConnections.length - before;
    fetchedThisRun += added;
    progress.addNew(added, allConnections.length);
    startIndex = allConnections.length;
    writeCsv(allConnections, OUTPUT_FILE);
    saveState({
      startIndex,
      totalSaved: allConnections.length,
      completed: false,
    });

    if (fetchedThisRun >= runLimit) {
      hitRunLimit = true;
      saveState({
        startIndex,
        totalSaved: allConnections.length,
        completed: false,
      });
      return {
        connections: allConnections,
        fetchedThisRun,
        hitRunLimit,
        linkedInListExhausted,
        stoppedOnDuplicates,
      };
    }
  }

  while (!hitRunLimit) {
    const delayMs = randomDelayMs();
    await sleepWithProgress(delayMs, progress);

    progress.setStatus(`Fetching from index ${startIndex.toLocaleString()}…`);
    const response = await fetchConnectionsPage(page, startIndex);

    if (!response.ok) {
      throw new Error(
        `Pagination request failed with HTTP ${response.status}: ${response.text.slice(
          0,
          300
        )}`
      );
    }

    const batch = parseConnectionsFromSduiResponse(response.text);
    if (batch.length === 0) {
      linkedInListExhausted = true;
      progress.setStatus('No more connections');
      break;
    }

    const before = allConnections.length;
    allConnections = mergeConnections(allConnections, batch);
    const added = allConnections.length - before;
    fetchedThisRun += added;

    progress.addNew(added, allConnections.length);
    progress.setStatus(
      added > 0
        ? `+${added} new (${allConnections.length.toLocaleString()} total)`
        : 'Skipping duplicates…'
    );

    writeCsv(allConnections, OUTPUT_FILE);
    startIndex += batch.length;

    if (fetchedThisRun >= runLimit) {
      hitRunLimit = true;
      progress.setStatus(`Run limit reached (${runLimit.toLocaleString()} new)`);
      break;
    }

    if (added === 0) {
      const syncTarget = allConnections.length;
      if (startIndex < syncTarget) {
        startIndex = syncTarget;
        consecutiveDuplicateBatches = 0;
        progress.setStatus(`Syncing to index ${startIndex.toLocaleString()}…`);
        saveState({
          startIndex,
          totalSaved: allConnections.length,
          completed: false,
        });
        continue;
      }

      consecutiveDuplicateBatches += 1;
      if (consecutiveDuplicateBatches >= MAX_CONSECUTIVE_DUPLICATE_BATCHES) {
        stoppedOnDuplicates = true;
        progress.setStatus('Paused — run again to continue');
        break;
      }
      continue;
    }

    consecutiveDuplicateBatches = 0;
  }

  saveState({
    startIndex,
    totalSaved: allConnections.length,
    completed: linkedInListExhausted && !hitRunLimit,
  });

  return {
    connections: allConnections,
    fetchedThisRun,
    hitRunLimit,
    linkedInListExhausted,
    stoppedOnDuplicates,
  };
}

function printStatus(state, connections, runLimit = DEFAULT_CONNECTIONS_PER_RUN) {
  console.log(`CSV: ${OUTPUT_FILE}`);
  console.log(`State: ${STATE_FILE}`);
  console.log(`Saved connections: ${connections.length}`);
  console.log(`Default per-run fetch limit: ${runLimit.toLocaleString()} new contacts`);
  console.log(`Next startIndex: ${state.startIndex}`);
  console.log(`Fully downloaded: ${state.completed ? 'yes' : 'no (run again to continue)'}`);
  if (state.updatedAt) {
    console.log(`Last updated: ${state.updatedAt}`);
  }
}

async function main() {
  if (!LINKEDIN_EMAIL) {
    console.error('Error: LINKEDIN_EMAIL environment variable is not set.');
    console.error('Copy .env.example to .env and add your LinkedIn email.');
    process.exit(1);
  }

  let flags;
  let runLimit;
  try {
    ({ flags, limit: runLimit } = parseCliArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const fresh = flags.has('--fresh');
  const resume = flags.has('--resume');

  if (fresh) {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
    if (fs.existsSync(OUTPUT_FILE)) {
      fs.unlinkSync(OUTPUT_FILE);
    }
  }

  let state = loadState();
  let existingConnections = fresh ? [] : loadConnectionsCsv(OUTPUT_FILE);

  if (flags.has('--status')) {
    printStatus(state, existingConnections);
    return;
  }

  if (state.completed && !fresh && !resume) {
    console.log('Download marked complete. Use --resume to continue, or --fresh to start over.');
    printStatus(state, existingConnections);
    return;
  }

  if (resume && state.completed) {
    state.completed = false;
  }

  if (!fresh && existingConnections.length > state.startIndex) {
    state.startIndex = existingConnections.length;
    state.totalSaved = existingConnections.length;
    state.completed = false;
    saveState(state);
  }

  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS === 'true' ? 'new' : false,
    userDataDir: path.join(__dirname, '.linkedin-session'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await ensureLoggedIn(page);

    const progress = createProgressReporter(existingConnections.length, runLimit);
    try {
      const result = await collectAllConnections(
        page,
        state,
        existingConnections,
        progress,
        runLimit
      );
      progress.end();
      printRunSummary(result, runLimit);
    } catch (err) {
      progress.end();
      throw err;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

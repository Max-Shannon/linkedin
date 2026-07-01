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
const MAX_CONNECTIONS = 5000;

const OUTPUT_FILE = path.join(__dirname, 'connections.csv');
const STATE_FILE = path.join(__dirname, 'download-connections-state.json');
const STATE_VERSION = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minMs = MIN_REQUEST_DELAY_MS, maxMs = MAX_REQUEST_DELAY_MS) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

function capConnections(connections) {
  if (connections.length <= MAX_CONNECTIONS) {
    return connections;
  }
  return connections.slice(0, MAX_CONNECTIONS);
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
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      version: STATE_VERSION,
      startIndex: Number(state.startIndex) || 0,
      totalSaved: Number(state.totalSaved) || 0,
      completed: Boolean(state.completed),
      updatedAt: state.updatedAt || null,
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
    console.log('LinkedIn requires additional verification (2FA/captcha).');
    console.log('Complete it in the browser window...');
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
    console.log('Using saved LinkedIn session.');
    return;
  }

  const password = await promptPassword();
  if (!password) {
    throw new Error('Password is required.');
  }

  console.log('Logging in to LinkedIn...');
  await loginToLinkedIn(page, password);
  await page.goto(CONNECTIONS_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  console.log('Logged in successfully.');
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

async function collectAllConnections(page, state, existingConnections) {
  let allConnections = capConnections([...existingConnections]);
  let startIndex = state.startIndex;

  if (allConnections.length >= MAX_CONNECTIONS) {
    console.log(`Already at ${MAX_CONNECTIONS} connection limit.`);
    saveState({
      startIndex,
      totalSaved: allConnections.length,
      completed: true,
    });
    return allConnections;
  }

  if (startIndex === 0) {
    console.log('Parsing initial connections from page HTML...');
    const initialHtml = await page.content();
    const initialBatch = parseConnectionsFromSduiResponse(initialHtml);
    const before = allConnections.length;
    allConnections = capConnections(mergeConnections(allConnections, initialBatch));
    const added = allConnections.length - before;
    console.log(`Initial page: ${added} connection(s)`);
    startIndex = allConnections.length;
    writeCsv(allConnections, OUTPUT_FILE);
    saveState({
      startIndex,
      totalSaved: allConnections.length,
      completed: allConnections.length >= MAX_CONNECTIONS,
    });

    if (allConnections.length >= MAX_CONNECTIONS) {
      console.log(`Reached ${MAX_CONNECTIONS} connection limit.`);
      return allConnections;
    }
  }

  while (true) {
    const delayMs = randomDelayMs();
    console.log(`Waiting ${(delayMs / 1000).toFixed(1)}s before next request...`);
    await sleep(delayMs);

    console.log(`Fetching pagination batch at startIndex=${startIndex}...`);
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
      console.log('No more connections returned.');
      break;
    }

    const before = allConnections.length;
    allConnections = capConnections(mergeConnections(allConnections, batch));
    const added = allConnections.length - before;

    console.log(
      `Batch parsed ${batch.length} connection(s), ${added} new (total ${allConnections.length})`
    );

    writeCsv(allConnections, OUTPUT_FILE);
    startIndex += batch.length;
    const hitLimit = allConnections.length >= MAX_CONNECTIONS;
    saveState({
      startIndex,
      totalSaved: allConnections.length,
      completed: hitLimit,
    });

    if (hitLimit) {
      console.log(`Reached ${MAX_CONNECTIONS} connection limit.`);
      break;
    }

    if (added === 0) {
      console.log('Pagination returned only duplicates; stopping.');
      break;
    }
  }

  if (allConnections.length < MAX_CONNECTIONS) {
    saveState({
      startIndex,
      totalSaved: allConnections.length,
      completed: true,
    });
  }

  return allConnections;
}

function printStatus(state, connections) {
  console.log(`CSV: ${OUTPUT_FILE}`);
  console.log(`State: ${STATE_FILE}`);
  console.log(`Saved connections: ${connections.length} (limit ${MAX_CONNECTIONS})`);
  console.log(`Next startIndex: ${state.startIndex}`);
  console.log(`Completed: ${state.completed ? 'yes' : 'no'}`);
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

  const args = new Set(process.argv.slice(2));
  const fresh = args.has('--fresh');

  if (fresh) {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
    if (fs.existsSync(OUTPUT_FILE)) {
      fs.unlinkSync(OUTPUT_FILE);
    }
    console.log('Cleared download state and CSV.');
  }

  let state = loadState();
  let existingConnections = fresh ? [] : loadConnectionsCsv(OUTPUT_FILE);

  if (args.has('--status')) {
    printStatus(state, existingConnections);
    return;
  }

  if (state.completed && !fresh) {
    console.log('Previous download marked complete. Use --fresh to start over.');
    printStatus(state, existingConnections);
    return;
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

    const connections = await collectAllConnections(
      page,
      state,
      existingConnections
    );

    console.log('');
    console.log(`Downloaded ${connections.length} connection(s).`);
    console.log(`CSV written to: ${OUTPUT_FILE}`);
    console.log(`Resume state: ${STATE_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL;
const INPUT_CSV = path.join(__dirname, 'sales-connections.csv');
const RESULT_FILE = path.join(__dirname, 'remove-connections-results.json');
const REMOVE_STATE_FILE = path.join(__dirname, 'remove-connections-state.json');
const REMOVE_STATE_VERSION = 1;
const REMOVE_ENDPOINT_BASE =
  'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request';
const REMOVE_ACTION_ID = 'com.linkedin.sdui.mynetwork.RemoveConnectionVanityName';

const SPAM_STATUSES = new Set(['sales', 'recruitment', 'sales_and_recruitment']);
const DEFAULT_IGNORE_COMPANIES = ['Manna', 'Meili'];

function matchesStatusFilter(rowStatus, filterStatus) {
  if (!filterStatus) {
    return true;
  }
  if (filterStatus === 'spam') {
    return SPAM_STATUSES.has(rowStatus);
  }
  return rowStatus === filterStatus;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIgnoreCompanies(argv) {
  const companies = [...DEFAULT_IGNORE_COMPANIES];

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ignore-company' && argv[i + 1]) {
      companies.push(argv[i + 1].trim());
      i += 1;
      continue;
    }
    if (arg === '--ignore-companies' && argv[i + 1]) {
      for (const company of argv[i + 1].split(',')) {
        const trimmed = company.trim();
        if (trimmed) {
          companies.push(trimmed);
        }
      }
      i += 1;
    }
  }

  return [...new Set(companies.filter(Boolean))];
}

function parseArgs(argv) {
  const args = {
    execute: false,
    fresh: false,
    limit: null,
    status: null,
    csv: INPUT_CSV,
    ignoreCompanies: parseIgnoreCompanies(argv),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      args.execute = true;
      continue;
    }
    if (arg === '--fresh') {
      args.fresh = true;
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--status' && argv[i + 1]) {
      args.status = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--csv' && argv[i + 1]) {
      args.csv = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return args;
}

function parseCsvRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function extractVanityName(profileUrl) {
  if (!profileUrl) {
    return '';
  }

  const match = String(profileUrl).match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match || !match[1]) {
    return '';
  }

  try {
    return decodeURIComponent(match[1]).trim();
  } catch (err) {
    console.error(err.stack || err.message);
    return String(match[1]).trim();
  }
}

function buildEmptyRemoveState() {
  return {
    version: REMOVE_STATE_VERSION,
    removed: {},
    updatedAt: new Date().toISOString(),
  };
}

function loadRemoveState() {
  if (!fs.existsSync(REMOVE_STATE_FILE)) {
    return buildEmptyRemoveState();
  }

  try {
    const state = JSON.parse(fs.readFileSync(REMOVE_STATE_FILE, 'utf8'));
    if (!state || typeof state.removed !== 'object') {
      return buildEmptyRemoveState();
    }
    state.version = REMOVE_STATE_VERSION;
    state.removed = state.removed || {};
    return state;
  } catch (err) {
    console.error(err.stack || err.message);
    return buildEmptyRemoveState();
  }
}

function saveRemoveState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(REMOVE_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function migrateRemovedFromResults(state) {
  if (!fs.existsSync(RESULT_FILE)) {
    return state;
  }

  try {
    const results = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
    if (!Array.isArray(results)) {
      return state;
    }

    for (const entry of results) {
      if (!entry.removed || !entry.vanityName || state.removed[entry.vanityName]) {
        continue;
      }
      state.removed[entry.vanityName] = {
        vanityName: entry.vanityName,
        name: entry.name || '',
        profileUrl: entry.profileUrl || '',
        removedAt: entry.at || new Date().toISOString(),
        responseStatus: entry.responseStatus ?? null,
      };
    }
  } catch (err) {
    console.error(err.stack || err.message);
  }

  return state;
}

function recordRemovedConnection(state, target, response) {
  state.removed[target.vanityName] = {
    vanityName: target.vanityName,
    name: target.name,
    profileUrl: target.profileUrl,
    removedAt: new Date().toISOString(),
    responseStatus: response.status,
  };
  saveRemoveState(state);
}

function isAlreadyRemoved(state, vanityName) {
  return Boolean(state.removed[vanityName]);
}

function filterAlreadyRemoved(targets, state) {
  const pending = [];
  let skipped = 0;

  for (const target of targets) {
    if (isAlreadyRemoved(state, target.vanityName)) {
      skipped += 1;
      continue;
    }
    pending.push(target);
  }

  return { pending, skipped };
}

function findIgnoredCompanyMatch(title, ignoreCompanies) {
  const searchable = String(title || '').toLowerCase();
  if (!searchable) {
    return null;
  }

  for (const company of ignoreCompanies) {
    const needle = String(company || '').trim().toLowerCase();
    if (needle && searchable.includes(needle)) {
      return company;
    }
  }

  return null;
}

function filterIgnoredCompanies(targets, ignoreCompanies) {
  const pending = [];
  let skipped = 0;

  for (const target of targets) {
    const matchedCompany = findIgnoredCompanyMatch(target.title, ignoreCompanies);
    if (matchedCompany) {
      skipped += 1;
      continue;
    }
    pending.push(target);
  }

  return { pending, skipped };
}

function formatTargetLabel(target) {
  const name = target.name || target.vanityName;
  if (target.title) {
    return `${name} — ${target.title}`;
  }
  return name;
}

function loadTargetsFromCsv(csvPath, args) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, 'utf8').trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split('\n');
  const targets = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const [name, title, profileUrl, status] = parseCsvRow(line);
    if (!profileUrl) {
      continue;
    }

    if (args.status && !matchesStatusFilter(status, args.status)) {
      continue;
    }

    const vanityName = extractVanityName(profileUrl);
    if (!vanityName) {
      continue;
    }

    targets.push({
      name: name || '',
      title: title || '',
      profileUrl,
      status: status || '',
      vanityName,
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const target of targets) {
    if (seen.has(target.vanityName)) {
      continue;
    }
    seen.add(target.vanityName);
    deduped.push(target);
  }

  return deduped;
}

function applyLimit(targets, limit) {
  if (limit && Number.isFinite(limit) && limit > 0) {
    return targets.slice(0, limit);
  }
  return targets;
}

function makeParentSpanId() {
  return encodeURIComponent(crypto.randomBytes(8).toString('base64'));
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
  await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
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
  console.log('Logged in successfully.');
}

async function removeConnection(page, vanityName) {
  const endpoint =
    `${REMOVE_ENDPOINT_BASE}?sduiid=${REMOVE_ACTION_ID}&parentSpanId=${makeParentSpanId()}`;

  return page.evaluate(
    async ({ url, disconnectVanityName, actionId }) => {
      const jsessionCookie = document.cookie
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('JSESSIONID='));
      const csrfToken = jsessionCookie
        ? jsessionCookie.substring('JSESSIONID='.length).replace(/^"|"$/g, '')
        : '';

      const payload = {
        requestId: actionId,
        serverRequest: {
          requestId: actionId,
          requestedArguments: {
            $type: 'proto.sdui.actions.requests.RequestedArguments',
            payload: {
              disconnectVanityName,
              closeCurrentMenuOnCompletion: true,
            },
            requestedStateKeys: [],
            requestMetadata: {
              $type: 'proto.sdui.common.RequestMetadata',
            },
          },
          isApfcEnabled: false,
          isStreaming: false,
          rumPageKey: '',
        },
        states: [],
        requestedArguments: {
          $type: 'proto.sdui.actions.requests.RequestedArguments',
          payload: {
            disconnectVanityName,
            closeCurrentMenuOnCompletion: true,
          },
          requestedStateKeys: [],
          requestMetadata: {
            $type: 'proto.sdui.common.RequestMetadata',
          },
          states: [],
          screenId: '',
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          'csrf-token': csrfToken,
          'x-li-rsc-stream': 'true',
          'x-li-anchor-page-key': 'd_flagship3_people_connections',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        body: text.slice(0, 500),
      };
    },
    { url: endpoint, disconnectVanityName: vanityName, actionId: REMOVE_ACTION_ID }
  );
}

async function main() {
  if (!LINKEDIN_EMAIL) {
    console.error('Error: LINKEDIN_EMAIL environment variable is not set.');
    console.error('Copy .env.example to .env and add your LinkedIn email.');
    process.exit(1);
  }

  const args = parseArgs(process.argv);

  let removeState = args.fresh ? buildEmptyRemoveState() : loadRemoveState();
  if (args.fresh && fs.existsSync(REMOVE_STATE_FILE)) {
    fs.unlinkSync(REMOVE_STATE_FILE);
    console.log('Cleared removal state.');
  } else {
    removeState = migrateRemovedFromResults(removeState);
    saveRemoveState(removeState);
  }

  const allTargets = loadTargetsFromCsv(args.csv, args);
  const { pending: companyFiltered, skipped: ignoredByCompany } = filterIgnoredCompanies(
    allTargets,
    args.ignoreCompanies
  );
  const { pending, skipped } = filterAlreadyRemoved(companyFiltered, removeState);
  const targets = applyLimit(pending, args.limit);

  if (allTargets.length === 0) {
    console.log('No matching targets found in CSV.');
    return;
  }

  if (ignoredByCompany > 0) {
    console.log(
      `Skipping ${ignoredByCompany} connection(s) at ignored companies (${args.ignoreCompanies.join(', ')}).`
    );
  }

  if (skipped > 0) {
    console.log(`Skipping ${skipped} already-removed connection(s).`);
  }

  if (targets.length === 0) {
    console.log('No pending targets left to remove.');
    console.log(`Removal state: ${REMOVE_STATE_FILE}`);
    return;
  }

  console.log(`Loaded ${targets.length} pending target(s) from ${args.csv}`);
  if (!args.execute) {
    console.log('Dry run mode. Add --execute to actually remove connections.');
    for (const target of targets.slice(0, 20)) {
      console.log(`- ${target.vanityName} (${formatTargetLabel(target)})`);
    }
    if (targets.length > 20) {
      console.log(`...and ${targets.length - 20} more`);
    }
    return;
  }

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: path.join(__dirname, '.linkedin-session'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const results = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await ensureLoggedIn(page);

    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      console.log(
        `[${i + 1}/${targets.length}] Removing ${target.vanityName} (${formatTargetLabel(target)})`
      );

      try {
        const response = await removeConnection(page, target.vanityName);
        results.push({
          ...target,
          removed: response.ok,
          responseStatus: response.status,
          responseBody: response.body,
          at: new Date().toISOString(),
        });
        if (response.ok) {
          recordRemovedConnection(removeState, target, response);
        } else {
          console.log(
            `  Failed (${response.status}) for ${target.vanityName}: ${response.body}`
          );
        }
      } catch (err) {
        console.error(err.stack || err.message);
        results.push({
          ...target,
          removed: false,
          responseStatus: null,
          responseBody: err.stack || err.message,
          at: new Date().toISOString(),
        });
      }

      fs.writeFileSync(RESULT_FILE, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
      await sleep(1200);
    }
  } finally {
    await browser.close();
  }

  const removedCount = results.filter((result) => result.removed).length;
  console.log(`Completed. Removed ${removedCount}/${results.length} connections.`);
  console.log(`Result log: ${RESULT_FILE}`);
  console.log(`Removal state: ${REMOVE_STATE_FILE}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

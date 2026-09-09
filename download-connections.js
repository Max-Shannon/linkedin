const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const { ensureLoggedIn, launchLinkedInBrowser } = require('./lib/linkedin-auth');
const { parseConnectionsFromSduiResponse } = require('./lib/parse-sdui-connections');
const {
  loadConnectionsCsv,
  writeConnectionsCsv,
  mergeConnections,
} = require('./lib/connections-csv');
const {
  monthsCutoffDate,
  formatCutoffLabel,
  filterConnectionsToMonthsWindow,
  batchIsPastMonthsWindow,
} = require('./lib/connected-date');
const {
  snapshotAll,
  writeProtectedFile,
  removeProtectedFile,
} = require('./lib/rolling-backup');

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
const STATE_VERSION = 3;
const PROGRESS_BAR_WIDTH = 32;
const HEARTBEAT_MS = 5000;

function parsePositiveIntArg(argv, index, flagName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flagName} requires a number`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive number`);
  }
  return Math.floor(parsed);
}

function parseCliArgs(argv) {
  const flags = new Set();
  let limit = DEFAULT_CONNECTIONS_PER_RUN;
  let months = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      limit = parsePositiveIntArg(argv, i, '--limit');
      i += 1;
      continue;
    }
    if (arg === '--months') {
      months = parsePositiveIntArg(argv, i, '--months');
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      flags.add(arg);
    }
  }

  return { flags, limit, months };
}

function createProgressReporter(initialTotal, runLimit) {
  let runNew = 0;
  let totalSaved = initialTotal;
  let status = 'Starting…';
  let pages = 0;
  let lastLineAt = Date.now();
  const startedAt = Date.now();
  const interactive = Boolean(process.stdout.isTTY);

  function elapsedLabel() {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function emit(line) {
    lastLineAt = Date.now();
    console.log(`[${elapsedLabel()}] ${line}`);
  }

  // Without a TTY the carriage-return bar is invisible, so callers get one
  // line per event instead.
  const heartbeat = interactive
    ? null
    : setInterval(() => {
        if (Date.now() - lastLineAt >= HEARTBEAT_MS) {
          emit(`still working — ${status}`);
        }
      }, HEARTBEAT_MS);
  if (heartbeat) {
    heartbeat.unref();
  }

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
      if (interactive) {
        render();
        return;
      }
      emit(nextStatus);
    },
    addNew(added, total) {
      runNew += added;
      totalSaved = total;
      pages += 1;
      if (interactive) {
        render();
        return;
      }
      const pct = Math.min(100, Math.round((runNew / runLimit) * 100));
      emit(
        `page ${pages} · +${added.toLocaleString()} new · ${runNew.toLocaleString()}/${runLimit.toLocaleString()} this run (${pct}%) · ${total.toLocaleString()} saved`
      );
    },
    setTotal(total) {
      totalSaved = total;
      if (interactive) {
        render();
        return;
      }
      emit(`Starting from ${total.toLocaleString()} saved connection(s).`);
    },
    end() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
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

function printRunSummary(result, runLimit, monthsOptions) {
  const {
    connections,
    fetchedThisRun,
    hitRunLimit,
    linkedInListExhausted,
    stoppedOnDuplicates,
    stoppedOnMonthsWindow,
  } = result;
  const months = monthsOptions && monthsOptions.months;
  const cutoffLabel = monthsOptions && monthsOptions.cutoffLabel;

  console.log('');
  console.log('═'.repeat(62));
  console.log('  Connections download');
  console.log('═'.repeat(62));
  console.log('');
  console.log(`  Saved in CSV:     ${connections.length.toLocaleString()} connections`);
  console.log(`  New this run:     ${fetchedThisRun.toLocaleString()} connections`);
  console.log(`  Output file:      ${OUTPUT_FILE}`);
  if (months) {
    console.log(`  Date window:      last ${months} month${months === 1 ? '' : 's'} (on or after ${cutoffLabel})`);
  }
  console.log('');
  console.log(`  ── About the ${runLimit.toLocaleString()} per-run limit ──`);
  console.log('');
  console.log(`  Each run downloads up to ${runLimit.toLocaleString()} NEW connections — not ${runLimit.toLocaleString()} total.`);
  console.log('  Your CSV keeps growing across runs (e.g. 5k → 10k → 15k → …).');
  console.log('  Progress is saved automatically, so you can stop and continue anytime.');
  console.log('');

  if (stoppedOnMonthsWindow) {
    console.log(`  ✓ Finished the last-${months}-month window (contacts on or after ${cutoffLabel}).`);
    console.log('    LinkedIn lists newest connections first, so older pages were not fetched.');
    console.log('');
    console.log('    To download the rest of the network:');
    console.log('      node download-connections.js --resume');
    console.log('');
    console.log('    For a CSV that only contains this window, use --fresh next time:');
    console.log(`      npm run connections:download -- --fresh --months ${months}`);
    console.log('');
    return;
  }

  if (linkedInListExhausted) {
    console.log('  ✓ All connections have been downloaded.');
    console.log('');
    return;
  }

  console.log('  ► Run the command again until the summary says all connections');
  console.log('    are downloaded:');
  console.log('');
  if (months) {
    console.log(`      npm run connections:download -- --months ${months}`);
  } else {
    console.log('      npm run connections:download');
  }
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

function emptyState() {
  return {
    version: STATE_VERSION,
    startIndex: 0,
    totalSaved: 0,
    completed: false,
    completedReason: null,
    monthsWindow: null,
    updatedAt: null,
  };
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return emptyState();
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
      completedReason: raw.completedReason || null,
      monthsWindow:
        raw.monthsWindow == null ? null : Number(raw.monthsWindow) || null,
      updatedAt: raw.updatedAt || null,
    };
  } catch (err) {
    console.error(err.stack || err.message);
    return emptyState();
  }
}

function saveState(state) {
  writeProtectedFile(
    STATE_FILE,
    `${JSON.stringify(
      {
        version: STATE_VERSION,
        startIndex: state.startIndex,
        totalSaved: state.totalSaved,
        completed: state.completed,
        completedReason: state.completedReason || null,
        monthsWindow: state.monthsWindow == null ? null : state.monthsWindow,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
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

async function collectAllConnections(
  page,
  state,
  existingConnections,
  progress,
  runLimit,
  monthsOptions
) {
  const cutoff = monthsOptions && monthsOptions.cutoff;
  const months = monthsOptions && monthsOptions.months;
  const cutoffLabel = monthsOptions && monthsOptions.cutoffLabel;

  let allConnections = [...existingConnections];
  let startIndex = Math.max(state.startIndex, 0);
  if (!cutoff) {
    startIndex = Math.max(state.startIndex, allConnections.length);
  }
  let fetchedThisRun = 0;
  let hitRunLimit = false;
  let linkedInListExhausted = false;
  let stoppedOnDuplicates = false;
  let stoppedOnMonthsWindow = false;
  let consecutiveDuplicateBatches = 0;

  function persist(partial) {
    saveState({
      startIndex,
      totalSaved: allConnections.length,
      completed: Boolean(partial.completed),
      completedReason: partial.completedReason || null,
      monthsWindow: months || state.monthsWindow || null,
    });
  }

  function applyBatch(batch) {
    const originalLength = batch.length;
    if (cutoff && batchIsPastMonthsWindow(batch, cutoff)) {
      startIndex += originalLength;
      stoppedOnMonthsWindow = true;
      progress.setStatus(`Stopping — contacts older than ${cutoffLabel}`);
      persist({
        completed: true,
        completedReason: 'months_window',
      });
      return { added: 0, done: true };
    }

    const toMerge = cutoff
      ? filterConnectionsToMonthsWindow(batch, cutoff)
      : batch;
    const before = allConnections.length;
    allConnections = mergeConnections(allConnections, toMerge);
    const added = allConnections.length - before;
    fetchedThisRun += added;
    startIndex += originalLength;
    progress.addNew(added, allConnections.length);
    writeConnectionsCsv(allConnections, OUTPUT_FILE);
    persist({ completed: false });
    return { added, done: false };
  }

  progress.setTotal(allConnections.length);

  if (startIndex === 0) {
    progress.setStatus('Reading first page…');
    const initialHtml = await page.content();
    const initialBatch = parseConnectionsFromSduiResponse(initialHtml);
    const applied = applyBatch(initialBatch);
    if (applied.done) {
      return {
        connections: allConnections,
        fetchedThisRun,
        hitRunLimit,
        linkedInListExhausted,
        stoppedOnDuplicates,
        stoppedOnMonthsWindow,
      };
    }

    if (fetchedThisRun >= runLimit) {
      hitRunLimit = true;
      persist({ completed: false });
      return {
        connections: allConnections,
        fetchedThisRun,
        hitRunLimit,
        linkedInListExhausted,
        stoppedOnDuplicates,
        stoppedOnMonthsWindow,
      };
    }
  }

  while (!hitRunLimit && !stoppedOnMonthsWindow) {
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

    const applied = applyBatch(batch);
    if (applied.done) {
      break;
    }

    progress.setStatus(
      applied.added > 0
        ? `+${applied.added} new (${allConnections.length.toLocaleString()} total)`
        : 'Skipping duplicates…'
    );

    if (fetchedThisRun >= runLimit) {
      hitRunLimit = true;
      progress.setStatus(`Run limit reached (${runLimit.toLocaleString()} new)`);
      break;
    }

    if (applied.added === 0) {
      const syncTarget = allConnections.length;
      if (!cutoff && startIndex < syncTarget) {
        startIndex = syncTarget;
        consecutiveDuplicateBatches = 0;
        progress.setStatus(`Syncing to index ${startIndex.toLocaleString()}…`);
        persist({ completed: false });
        continue;
      }

      if (cutoff) {
        progress.setStatus('Already in CSV — continuing to date cutoff…');
        persist({ completed: false });
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

  persist({
    completed:
      (linkedInListExhausted || stoppedOnMonthsWindow) && !hitRunLimit,
    completedReason: stoppedOnMonthsWindow
      ? 'months_window'
      : linkedInListExhausted && !hitRunLimit
        ? 'list_exhausted'
        : null,
  });

  return {
    connections: allConnections,
    fetchedThisRun,
    hitRunLimit,
    linkedInListExhausted,
    stoppedOnDuplicates,
    stoppedOnMonthsWindow,
  };
}

function printStatus(state, connections, runLimit = DEFAULT_CONNECTIONS_PER_RUN) {
  console.log(`CSV: ${OUTPUT_FILE}`);
  console.log(`State: ${STATE_FILE}`);
  console.log(`Saved connections: ${connections.length}`);
  console.log(`Default per-run fetch limit: ${runLimit.toLocaleString()} new contacts`);
  console.log(`Next startIndex: ${state.startIndex}`);
  if (state.monthsWindow) {
    if (state.completed && state.completedReason === 'months_window') {
      console.log(`Fully downloaded: yes (last ${state.monthsWindow} months)`);
    } else {
      console.log(`Months window: last ${state.monthsWindow} months (in progress)`);
      console.log(`Fully downloaded: ${state.completed ? 'yes' : 'no (run again to continue)'}`);
    }
  } else {
    console.log(`Fully downloaded: ${state.completed ? 'yes' : 'no (run again to continue)'}`);
  }
  if (state.completedReason && state.completedReason !== 'months_window') {
    console.log(`Completed reason: ${state.completedReason}`);
  }
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
  let months;
  try {
    ({ flags, limit: runLimit, months } = parseCliArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const fresh = flags.has('--fresh');
  const resume = flags.has('--resume');
  const monthsOptions = months
    ? {
        months,
        cutoff: monthsCutoffDate(months),
        cutoffLabel: formatCutoffLabel(monthsCutoffDate(months)),
      }
    : null;

  snapshotAll();

  if (fresh) {
    if (fs.existsSync(STATE_FILE)) {
      removeProtectedFile(STATE_FILE);
    }
    if (fs.existsSync(OUTPUT_FILE)) {
      removeProtectedFile(OUTPUT_FILE);
    }
  }

  let state = loadState();
  let existingConnections = fresh ? [] : loadConnectionsCsv(OUTPUT_FILE);

  if (flags.has('--status')) {
    printStatus(state, existingConnections);
    return;
  }

  if (state.completed && !fresh && !resume && !monthsOptions) {
    if (state.completedReason === 'months_window') {
      console.log(
        `Download marked complete for the last-${state.monthsWindow || '?'}-month window.`
      );
      console.log(
        'Use --resume to continue past that window, --months N to refresh the window, or --fresh to start over.'
      );
    } else {
      console.log('Download marked complete. Use --resume to continue, or --fresh to start over.');
    }
    printStatus(state, existingConnections);
    return;
  }

  if (resume && state.completed) {
    state.completed = false;
    state.completedReason = null;
  }

  if (monthsOptions) {
    const resumingMonths =
      state.monthsWindow === months &&
      !state.completed &&
      state.startIndex > 0;

    if (!fresh && existingConnections.length > 0 && !resumingMonths) {
      console.log(
        `Existing CSV has ${existingConnections.length.toLocaleString()} contacts.`
      );
      console.log(
        `--months ${months} pages from the newest connections until ${monthsOptions.cutoffLabel}; older CSV rows are kept.`
      );
      console.log(
        `Use --fresh --months ${months} for a file that only contains the last ${months} months.`
      );
      console.log('');
    }

    if (!resumingMonths) {
      state.startIndex = 0;
      state.completed = false;
      state.completedReason = null;
      state.monthsWindow = months;
    }
  }

  if (!monthsOptions && !fresh && existingConnections.length > state.startIndex) {
    state.startIndex = existingConnections.length;
    state.totalSaved = existingConnections.length;
    state.completed = false;
    saveState(state);
  }

  console.log('Launching browser…');
  const browser = await launchLinkedInBrowser({
    headless: process.env.HEADLESS === 'true',
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    console.log('Opening LinkedIn connections page…');
    await ensureLoggedIn(page, CONNECTIONS_URL);
    console.log('Ready. Starting scan…');

    const progress = createProgressReporter(existingConnections.length, runLimit);
    try {
      const result = await collectAllConnections(
        page,
        state,
        existingConnections,
        progress,
        runLimit,
        monthsOptions
      );
      progress.end();
      printRunSummary(result, runLimit, monthsOptions);
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

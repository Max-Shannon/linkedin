const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const LINKEDIN_EMAIL = 'LINKEDIN_EMAIL_REDACTED';
const SEARCH_URL_BASE = 'https://www.linkedin.com/search/results/people/';
const REQUEST_DELAY_MS = 2000;
const CSV_FLUSH_INTERVAL = 500;
const MAX_LINKEDIN_PAGES = 25;

const OUTPUT_FILE = path.join(__dirname, 'sales-connections.csv');
const STATE_FILE = path.join(__dirname, 'scrape-state.json');
const SEARCH_PLAN_FILE = path.join(__dirname, 'search-plan.json');
const STATE_VERSION = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeCsv(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(rows, filePath) {
  const header = ['name', 'title', 'profile_url', 'status', 'search_id', 'geo'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.name,
        row.title,
        row.profileUrl,
        row.status,
        row.searchId || '',
        row.geo || '',
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
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

function matchesSalesKeyword(connection) {
  const searchable =
    `${connection.title || ''} ${connection.currentRole || ''}`.toLowerCase();

  const salesRolePatterns = [
    /\bsales\b/,
    /\bbusiness development\b/,
    /\bbiz dev\b/,
    /\bbd\b/,
    /\bbdr\b/,
    /\bsdr\b/,
    /\baccount executive\b/,
    /\baccount manager\b/,
    /\bnew business\b/,
    /\binside sales\b/,
    /\bfield sales\b/,
    /\boutbound\b/,
    /\binbound\b/,
    /\brevenue\b/,
    /\bpartnerships?\b/,
    /\bcommercial\b/,
    /\bgtm\b/,
  ];

  const salesRoleTitles = [
    'chief revenue officer',
    'cro',
    'head of revenue',
    'head of growth',
    'vp revenue',
    'vp growth',
    'revenue operations',
    'sales operations',
    'sales enablement',
    'growth manager',
    'growth lead',
  ];

  if (salesRoleTitles.some((title) => searchable.includes(title))) {
    return true;
  }

  return salesRolePatterns.some((pattern) => pattern.test(searchable));
}

function matchesRecruitmentKeyword(connection) {
  const searchable =
    `${connection.title || ''} ${connection.currentRole || ''}`.toLowerCase();

  const recruitmentPatterns = [
    /\brecruit\w*\b/,
    /\btalent acquisition\b/,
    /\bta specialist\b/,
    /\bstaffing\b/,
    /\bsourcer\b/,
    /\bheadhunt\w*\b/,
    /\bresourcing\b/,
  ];

  const recruitmentTitles = [
    'recruitment consultant',
    'recruitment manager',
    'technical recruiter',
    'executive recruiter',
    'talent partner',
    'talent acquisition manager',
    'head of recruitment',
    'head of talent acquisition',
  ];

  if (recruitmentTitles.some((title) => searchable.includes(title))) {
    return true;
  }

  return recruitmentPatterns.some((pattern) => pattern.test(searchable));
}

function connectionStatus(connection) {
  const isSales = matchesSalesKeyword(connection);
  const isRecruitment = matchesRecruitmentKeyword(connection);

  if (isSales && isRecruitment) {
    return 'sales_and_recruitment';
  }
  if (isSales) {
    return 'sales';
  }
  if (isRecruitment) {
    return 'recruitment';
  }
  return 'not_target';
}

function loadCsvConnections(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split('\n');
  const connections = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const [name, title, profileUrl, status, searchId, geo] = parseCsvRow(line);
    if (!name) {
      continue;
    }

    connections.push({
      name,
      title: title || '',
      profileUrl: profileUrl || '',
      status: status || connectionStatus({ title, currentRole: '' }),
      searchId: searchId || '',
      geo: geo || '',
    });
  }

  return connections;
}

function loadSearchPlan() {
  if (!fs.existsSync(SEARCH_PLAN_FILE)) {
    throw new Error(`Missing search plan: ${SEARCH_PLAN_FILE}`);
  }

  const plan = JSON.parse(fs.readFileSync(SEARCH_PLAN_FILE, 'utf8'));
  if (!plan || !Array.isArray(plan.keywords) || !Array.isArray(plan.geos)) {
    throw new Error(
      `Invalid search plan format in ${SEARCH_PLAN_FILE}. Expected "keywords" and "geos" arrays.`
    );
  }

  if (plan.keywords.length === 0 || plan.geos.length === 0) {
    throw new Error(`Search plan in ${SEARCH_PLAN_FILE} must not be empty.`);
  }

  return {
    network: plan.network || 'F',
    keywords: plan.keywords,
    geos: plan.geos,
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSearchId(keyword, geoId) {
  return `${slugify(keyword)}__${slugify(geoId)}`;
}

function buildSearchQueue(plan) {
  const queue = [];
  for (const keyword of plan.keywords) {
    for (const geo of plan.geos) {
      queue.push({
        id: buildSearchId(keyword, geo.id),
        keywords: keyword,
        geoId: geo.id,
        geoLabel: geo.label,
        geoUrn: geo.geoUrn,
        network: plan.network,
      });
    }
  }
  return queue;
}

function buildStateFromQueue(queue) {
  const searches = {};
  for (const item of queue) {
    searches[item.id] = {
      keywords: item.keywords,
      geoId: item.geoId,
      geoLabel: item.geoLabel,
      geoUrn: item.geoUrn,
      network: item.network,
      status: 'pending',
      nextPage: 1,
      lastCompletedPage: 0,
      profilesOnPage: 0,
      hitCap: false,
      completedAt: null,
    };
  }

  return {
    version: STATE_VERSION,
    activeSearchId: null,
    searches,
    completedSearchIds: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadScrapeState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    console.error(err.stack || err.message);
    return null;
  }
}

function saveScrapeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function resetScrapeProgress() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

function resetAllProgress() {
  resetScrapeProgress();
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }
}

function connectionsToSeenSet(connections) {
  const seen = new Set();
  for (const connection of connections) {
    seen.add(connection.profileUrl || connection.name);
  }
  return seen;
}

function isStateV2(state) {
  return (
    state &&
    state.version === STATE_VERSION &&
    state.searches &&
    typeof state.searches === 'object'
  );
}

function syncStateWithQueue(state, queue) {
  const synced = {
    ...state,
    searches: { ...state.searches },
  };
  const validIds = new Set();

  for (const item of queue) {
    validIds.add(item.id);
    if (!synced.searches[item.id]) {
      synced.searches[item.id] = {
        keywords: item.keywords,
        geoId: item.geoId,
        geoLabel: item.geoLabel,
        geoUrn: item.geoUrn,
        network: item.network,
        status: 'pending',
        nextPage: 1,
        lastCompletedPage: 0,
        profilesOnPage: 0,
        hitCap: false,
        completedAt: null,
      };
      continue;
    }

    synced.searches[item.id].keywords = item.keywords;
    synced.searches[item.id].geoId = item.geoId;
    synced.searches[item.id].geoLabel = item.geoLabel;
    synced.searches[item.id].geoUrn = item.geoUrn;
    synced.searches[item.id].network = item.network;
  }

  for (const existingId of Object.keys(synced.searches)) {
    if (!validIds.has(existingId)) {
      delete synced.searches[existingId];
    }
  }

  synced.completedSearchIds = Object.keys(synced.searches).filter((id) =>
    ['completed', 'saturated'].includes(synced.searches[id].status)
  );

  return synced;
}

function pickNextSearchId(state, queue) {
  for (const item of queue) {
    const search = state.searches[item.id];
    if (!search) {
      continue;
    }
    if (search.status === 'in_progress') {
      return item.id;
    }
    if (search.status === 'pending') {
      return item.id;
    }
  }
  return null;
}

function resolveResumeState(options) {
  const plan = loadSearchPlan();
  const queue = buildSearchQueue(plan);

  if (options.freshAll) {
    resetAllProgress();
    console.log('Fresh all: cleared scrape state and CSV.');
  } else if (options.fresh) {
    resetScrapeProgress();
    console.log('Fresh state: cleared scrape state.');
  }

  const connections = loadCsvConnections(OUTPUT_FILE);
  const seen = connectionsToSeenSet(connections);

  const loaded = loadScrapeState();
  let state;

  if (!loaded) {
    state = buildStateFromQueue(queue);
  } else if (!isStateV2(loaded)) {
    console.log('Ignoring legacy scrape-state format and starting v2 state.');
    state = buildStateFromQueue(queue);
  } else {
    state = syncStateWithQueue(loaded, queue);
  }

  for (const search of Object.values(state.searches)) {
    if (search.status === 'in_progress' && (!search.nextPage || search.nextPage < 1)) {
      search.nextPage = 1;
    }
  }

  state.activeSearchId = pickNextSearchId(state, queue);
  saveScrapeState(state);

  return {
    plan,
    queue,
    state,
    connections,
    seen,
    lastFlushedCount: connections.length,
  };
}

function toQuotedTitle(title) {
  const trimmed = String(title || '').trim();
  if (!trimmed) {
    return '""';
  }
  const escaped = trimmed.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function buildSearchUrl({ keywords, geoUrn, network, pageNumber }) {
  const params = new URLSearchParams();
  params.set('title', toQuotedTitle(keywords));
  params.set('network', JSON.stringify([network]));
  params.set('origin', 'FACETED_SEARCH');
  params.set('page', String(pageNumber));
  if (geoUrn) {
    params.set('geoUrn', JSON.stringify([geoUrn]));
  }
  return `${SEARCH_URL_BASE}?${params.toString()}`;
}

async function waitForSearchResults(page) {
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector('main') || document.body;
        if (!main) {
          return false;
        }

        if (main.querySelector('a[href*="/in/"]')) {
          return true;
        }

        const text = (main.innerText || '').toLowerCase();
        if (
          text.includes('no results') ||
          text.includes("we couldn’t find") ||
          text.includes("we couldn't find") ||
          text.includes('try changing your search') ||
          text.includes('no people found')
        ) {
          return true;
        }

        const paginationControl =
          main.querySelector('button[aria-label*="Next"]') ||
          main.querySelector('a[aria-label*="Next"]') ||
          main.querySelector('button[aria-label*="next"]') ||
          main.querySelector('a[aria-label*="next"]');

        return Boolean(paginationControl);
      },
      { timeout: 8000 }
    )
    .catch(() => {});

  await sleep(800);
}

async function extractPeopleFromPage(page) {
  return page.evaluate(() => {
    if (!/search\/results\/people/.test(window.location.href)) {
      return { rows: [], error: 'not on people search page' };
    }

    const main = document.querySelector('main') || document.body;
    const normalize = (text) =>
      String(text || '')
        .replace(/[\s\u00a0\u202f]+/g, ' ')
        .trim();

    function getProfileHandle(href) {
      const match = (href || '').match(/\/in\/([^/?#]+)/);
      return match ? match[1] : null;
    }

    function extractNameFromAnchor(anchor) {
      let name = '';

      for (const child of anchor.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          name += child.textContent;
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE || child.tagName !== 'SPAN') {
          continue;
        }

        const isDecorative =
          child.querySelector('svg') || child.getAttribute('role') === 'img';
        if (!isDecorative) {
          name += child.textContent;
        }
      }

      return normalize(name)
        .replace(/^Status is (online|offline)\.?\s*/i, '')
        .replace(/'?s profile$/i, '')
        .replace(/\s*[•·].*$/, '')
        .trim();
    }

    function isPrimaryProfileLink(anchor) {
      const href = anchor.getAttribute('href') || '';
      if (!getProfileHandle(href)) {
        return false;
      }
      if (href.includes('/search/results/') || href.includes('/messaging/')) {
        return false;
      }

      const paragraph = anchor.closest('p');
      if (!paragraph) {
        return false;
      }

      const paragraphText = normalize(paragraph.textContent);
      if (/mutual connection|shared connection|other mutual/i.test(paragraphText)) {
        return false;
      }

      if (/[•·]\s*(?:1st|2nd|3rd)/i.test(paragraphText)) {
        return true;
      }

      if (paragraphText.includes(',') && paragraphText.includes('&')) {
        return false;
      }

      return extractNameFromAnchor(anchor).length > 1;
    }

    function getResultCard(anchor) {
      const cards = [];
      let element = anchor;

      while (element && element !== main) {
        if (element.hasAttribute && element.hasAttribute('componentkey')) {
          cards.push(element);
        }
        element = element.parentElement;
      }

      return cards.length > 0 ? cards[cards.length - 1] : anchor.parentElement;
    }

    function extractPaginationInfo() {
      const normalizePage = (value) => {
        if (!/^\d+$/.test(value)) {
          return null;
        }
        return Number(value);
      };

      const nextControl =
        document.querySelector('button[aria-label*="Next"]') ||
        document.querySelector('a[aria-label*="Next"]') ||
        document.querySelector('button[aria-label*="next"]') ||
        document.querySelector('a[aria-label*="next"]');

      if (!nextControl) {
        return {
          currentPage: null,
          lastPageVisible: null,
          hasNext: null,
        };
      }

      const paginationScope =
        nextControl.closest('nav') ||
        nextControl.closest('ul') ||
        nextControl.closest('section') ||
        nextControl.closest('div') ||
        document.body;

      const pageNumbers = [];
      for (const el of paginationScope.querySelectorAll('button, a, span, li')) {
        const text = normalize(el.textContent);
        const page = normalizePage(text);
        if (page != null) {
          pageNumbers.push(page);
        }
      }

      const currentElement =
        paginationScope.querySelector('[aria-current="true"]') ||
        paginationScope.querySelector('[aria-current="page"]');
      let currentPage = null;
      if (currentElement) {
        currentPage = normalizePage(normalize(currentElement.textContent));
      }

      if (currentPage == null) {
        const fromUrl = Number(
          new URL(window.location.href).searchParams.get('page')
        );
        if (Number.isFinite(fromUrl) && fromUrl > 0) {
          currentPage = fromUrl;
        }
      }

      const disabled =
        nextControl.hasAttribute('disabled') ||
        nextControl.getAttribute('aria-disabled') === 'true' ||
        nextControl.closest('[aria-disabled="true"]');

      return {
        currentPage,
        lastPageVisible: pageNumbers.length > 0 ? Math.max(...pageNumbers) : null,
        hasNext: !disabled,
      };
    }

    function detectNoResults() {
      const text = normalize((main.innerText || '').toLowerCase());
      if (
        text.includes('no results found') ||
        text.includes('no results') ||
        text.includes("we couldn't find") ||
        text.includes('try removing filters') ||
        text.includes('remove all filters') ||
        text.includes('try rephrasing your search')
      ) {
        return true;
      }

      return Boolean(
        main.querySelector('button[aria-label*="Remove all filters"]') ||
          main.querySelector('a[aria-label*="Remove all filters"]')
      );
    }

    function detectBlankResultsState() {
      const hasProfileLinks = Boolean(main.querySelector('a[href*="/in/"]'));
      if (hasProfileLinks) {
        return false;
      }

      const hasPaginator = Boolean(
        main.querySelector('button[aria-label*="Next"]') ||
          main.querySelector('a[aria-label*="Next"]') ||
          main.querySelector('button[aria-label*="next"]') ||
          main.querySelector('a[aria-label*="next"]')
      );
      if (hasPaginator) {
        return false;
      }

      const hasLoadingState = Boolean(
        main.querySelector('[aria-busy="true"]') ||
          main.querySelector('[role="progressbar"]')
      );
      if (hasLoadingState) {
        return false;
      }

      const text = normalize((main.innerText || '').toLowerCase());
      const hasBlankScreenSignals =
        text.includes('your job search powered by your network') ||
        text.includes('privacy & terms') ||
        text.includes('linkedin corporation');

      return hasBlankScreenSignals;
    }

    const rows = [];
    const seenHandles = new Set();

    for (const anchor of main.querySelectorAll('a[href*="/in/"]')) {
      if (!isPrimaryProfileLink(anchor)) {
        continue;
      }

      const handle = getProfileHandle(anchor.getAttribute('href'));
      if (!handle || seenHandles.has(handle)) {
        continue;
      }

      const name = extractNameFromAnchor(anchor);
      if (!name) {
        continue;
      }

      const card = getResultCard(anchor);
      if (!card) {
        continue;
      }

      seenHandles.add(handle);

      let headline = '';
      let currentRole = '';

      for (const paragraph of card.querySelectorAll('p')) {
        const text = normalize(paragraph.textContent);
        if (!text) {
          continue;
        }
        if (/mutual connection|shared connection|other mutual/i.test(text)) {
          continue;
        }
        if (/^(Message|Connect|Follow|View profile|Pending|Remove)$/i.test(text)) {
          continue;
        }
        if (text.includes(name) && /[•·]\s*(?:1st|2nd|3rd)/i.test(text)) {
          continue;
        }
        if (/^Current:/i.test(text)) {
          currentRole = text.replace(/^Current:\s*/i, '');
          continue;
        }
        if (/^[•·]\s*(?:1st|2nd|3rd)/i.test(text)) {
          continue;
        }
        if (!headline && text !== name && !text.startsWith(`${name} `)) {
          headline = text;
        }
      }

      rows.push({
        name,
        title: headline,
        currentRole,
        profileUrl: `https://www.linkedin.com/in/${handle}/`,
      });
    }

    return {
      rows,
      pagination: extractPaginationInfo(),
      noResults: detectNoResults(),
      blankResults: detectBlankResultsState(),
    };
  });
}

function addUniqueConnections(target, seen, incoming, searchMeta) {
  let added = 0;
  let salesAdded = 0;

  for (const connection of incoming) {
    const title = [connection.title, connection.currentRole]
      .filter(Boolean)
      .join(' | ');
    const status = connectionStatus(connection);
    const key = connection.profileUrl || connection.name;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    target.push({
      name: connection.name,
      title,
      profileUrl: connection.profileUrl || '',
      status,
      searchId: searchMeta.id,
      geo: searchMeta.geoLabel,
    });
    added += 1;
    if (status === 'sales') {
      salesAdded += 1;
    }
  }

  return { added, salesAdded };
}

function flushCsvIfNeeded(allConnections, lastFlushedCount, force = false) {
  const pending = allConnections.length - lastFlushedCount;
  if (!force && pending < CSV_FLUSH_INTERVAL) {
    return lastFlushedCount;
  }

  if (allConnections.length === 0) {
    return lastFlushedCount;
  }

  const sorted = [...allConnections].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  writeCsv(sorted, OUTPUT_FILE);
  console.log(
    `  CSV checkpoint: ${allConnections.length} contacts written to ${OUTPUT_FILE}`
  );
  return allConnections.length;
}

function buildSearchProgressSummary(state, queue) {
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let saturated = 0;

  for (const item of queue) {
    const search = state.searches[item.id];
    if (!search) {
      continue;
    }
    if (search.status === 'pending') pending += 1;
    if (search.status === 'in_progress') inProgress += 1;
    if (search.status === 'completed') completed += 1;
    if (search.status === 'saturated') saturated += 1;
  }

  return { pending, inProgress, completed, saturated, total: queue.length };
}

function printStatus(state, queue, allConnections) {
  const summary = buildSearchProgressSummary(state, queue);
  const salesCount = allConnections.filter((row) =>
    ['sales', 'sales_and_recruitment'].includes(row.status)
  ).length;
  const recruitmentCount = allConnections.filter((row) =>
    ['recruitment', 'sales_and_recruitment'].includes(row.status)
  ).length;

  console.log(`Searches total: ${summary.total}`);
  console.log(`Pending: ${summary.pending}`);
  console.log(`In progress: ${summary.inProgress}`);
  console.log(`Completed: ${summary.completed}`);
  console.log(`Saturated: ${summary.saturated}`);
  console.log(`Contacts in CSV: ${allConnections.length}`);
  console.log(`Sales contacts in CSV: ${salesCount}`);
  console.log(`Recruitment contacts in CSV: ${recruitmentCount}`);

  if (state.activeSearchId) {
    const active = state.searches[state.activeSearchId];
    console.log(
      `Next search: ${state.activeSearchId} (page ${active.nextPage || 1})`
    );
  } else {
    console.log('No pending searches. All cells are completed or saturated.');
  }
}

async function collectSegmentedConnections(page, runtime) {
  const allConnections = runtime.connections;
  const seen = runtime.seen;
  let lastFlushedCount = runtime.lastFlushedCount;
  const state = runtime.state;
  const queue = runtime.queue;

  while (true) {
    const nextSearchId = pickNextSearchId(state, queue);
    state.activeSearchId = nextSearchId;
    saveScrapeState(state);

    if (!nextSearchId) {
      break;
    }

    const search = state.searches[nextSearchId];
    const searchIndex = queue.findIndex((item) => item.id === nextSearchId) + 1;
    const searchMeta = queue.find((item) => item.id === nextSearchId);
    let pageNumber = search.nextPage || 1;
    let emptyPages = 0;

    search.status = 'in_progress';
    saveScrapeState(state);

    console.log(
      `Search ${searchIndex}/${queue.length}: ${search.keywords} / ${search.geoLabel} (starting page ${pageNumber})`
    );

    while (true) {
      const searchUrl = buildSearchUrl({
        keywords: search.keywords,
        geoUrn: search.geoUrn,
        network: search.network || runtime.plan.network,
        pageNumber,
      });

      console.log(`  Page ${pageNumber}: ${searchUrl}`);

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await waitForSearchResults(page);

      const { rows, error, pagination, noResults, blankResults } =
        await extractPeopleFromPage(page);
      if (error) {
        throw new Error(error);
      }

      search.profilesOnPage = rows.length;
      const { added, salesAdded } = addUniqueConnections(
        allConnections,
        seen,
        rows,
        searchMeta
      );
      console.log(
        `    extracted ${rows.length}, added ${added} contacts (${salesAdded} sales, ${allConnections.length} total)`
      );

      lastFlushedCount = flushCsvIfNeeded(allConnections, lastFlushedCount, true);

      search.lastCompletedPage = pageNumber;
      search.nextPage = pageNumber + 1;
      state.completedSearchIds = Object.keys(state.searches).filter((id) =>
        ['completed', 'saturated'].includes(state.searches[id].status)
      );
      saveScrapeState(state);

      if (noResults) {
        search.status = 'completed';
        search.completedAt = new Date().toISOString();
        state.completedSearchIds = Object.keys(state.searches).filter((id) =>
          ['completed', 'saturated'].includes(state.searches[id].status)
        );
        saveScrapeState(state);
        console.log(
          `    LinkedIn no-results state detected on page ${pageNumber}. Ending this sub-search.`
        );
        break;
      }

      if (blankResults) {
        search.status = 'completed';
        search.completedAt = new Date().toISOString();
        state.completedSearchIds = Object.keys(state.searches).filter((id) =>
          ['completed', 'saturated'].includes(state.searches[id].status)
        );
        saveScrapeState(state);
        console.log(
          `    LinkedIn blank-results state detected on page ${pageNumber}. Ending this sub-search.`
        );
        break;
      }

      const reachedPaginationEnd =
        pagination &&
        pagination.hasNext === false &&
        pagination.currentPage != null &&
        pagination.currentPage === pageNumber &&
        (pagination.lastPageVisible == null ||
          pagination.currentPage >= pagination.lastPageVisible) &&
        pageNumber < MAX_LINKEDIN_PAGES;

      if (reachedPaginationEnd) {
        search.status = 'completed';
        search.completedAt = new Date().toISOString();
        state.completedSearchIds = Object.keys(state.searches).filter((id) =>
          ['completed', 'saturated'].includes(state.searches[id].status)
        );
        saveScrapeState(state);
        console.log(
          `    Reached last page via pagination controls (page ${pageNumber}). Ending this sub-search.`
        );
        break;
      }

      if (pageNumber >= MAX_LINKEDIN_PAGES && rows.length >= 10) {
        search.status = 'saturated';
        search.hitCap = true;
        search.completedAt = new Date().toISOString();
        state.completedSearchIds = Object.keys(state.searches).filter((id) =>
          ['completed', 'saturated'].includes(state.searches[id].status)
        );
        saveScrapeState(state);
        console.log(
          `    Search saturated at page ${MAX_LINKEDIN_PAGES}. Consider splitting this cell further.`
        );
        break;
      }

      if (rows.length === 0) {
        emptyPages += 1;
        if (emptyPages >= 2) {
          search.status = 'completed';
          search.completedAt = new Date().toISOString();
          state.completedSearchIds = Object.keys(state.searches).filter((id) =>
            ['completed', 'saturated'].includes(state.searches[id].status)
          );
          saveScrapeState(state);
          break;
        }
      } else {
        emptyPages = 0;
      }

      pageNumber += 1;
      await sleep(REQUEST_DELAY_MS);
    }

    if (search.status === 'in_progress') {
      search.status = 'completed';
      search.completedAt = new Date().toISOString();
    }

    state.completedSearchIds = Object.keys(state.searches).filter((id) =>
      ['completed', 'saturated'].includes(state.searches[id].status)
    );
    saveScrapeState(state);
  }

  flushCsvIfNeeded(allConnections, lastFlushedCount, true);
  state.activeSearchId = null;
  saveScrapeState(state);

  return allConnections;
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

  const usernameSelector = '#username';
  const passwordSelector = '#password';

  await page.waitForSelector(usernameSelector, { timeout: 30000 });
  await page.click(usernameSelector, { clickCount: 3 });
  await page.type(usernameSelector, LINKEDIN_EMAIL, { delay: 30 });
  await page.type(passwordSelector, password, { delay: 30 });

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
  } else {
    console.log('Waiting for login to complete...');
  }

  await page.waitForFunction(() => document.cookie.includes('li_at='), {
    timeout: 300000,
  });
}

async function ensureLoggedIn(page) {
  await page.goto('https://www.linkedin.com/feed/', {
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

async function main() {
  const headless = process.env.HEADLESS === 'true';
  const args = new Set(process.argv.slice(2));
  const runtime = resolveResumeState({
    fresh: args.has('--fresh'),
    freshAll: args.has('--fresh-all'),
  });

  if (args.has('--status')) {
    printStatus(runtime.state, runtime.queue, runtime.connections);
    return;
  }

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    userDataDir: path.join(__dirname, '.linkedin-session'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    await ensureLoggedIn(page);

    console.log(
      `Running segmented search queue: ${runtime.queue.length} search cells`
    );
    const allConnections = await collectSegmentedConnections(page, runtime);
    const salesCount = allConnections.filter((row) =>
      ['sales', 'sales_and_recruitment'].includes(row.status)
    ).length;
    const recruitmentCount = allConnections.filter((row) =>
      ['recruitment', 'sales_and_recruitment'].includes(row.status)
    ).length;
    const summary = buildSearchProgressSummary(runtime.state, runtime.queue);

    console.log('');
    console.log(
      `Scraped ${allConnections.length} contacts (${salesCount} sales, ${recruitmentCount} recruitment).`
    );
    console.log(`CSV written to: ${OUTPUT_FILE}`);
    console.log(`Progress metadata: ${STATE_FILE}`);
    console.log(
      `Search queue status - pending: ${summary.pending}, in_progress: ${summary.inProgress}, completed: ${summary.completed}, saturated: ${summary.saturated}`
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

const path = require('path');
const {
  createEmptyProfile,
  mergeUniqueByKey,
} = require('./profile-schema');
const { parseProfileEntities } = require('./parse-voyager-profile');
const {
  buildProfileEndpoints,
  voyagerGetMany,
  createNetworkCapture,
} = require('./voyager-client');
const {
  scrapeMainProfileDom,
  scrapeDetailsListDom,
  scrapeExperienceRichDom,
  detailSectionsForMode,
} = require('./profile-dom-scraper');
const { saveProfileBundle, slugify } = require('./profile-store');
const { createVisitLog } = require('./visit-log');
const { captureAndDownloadProfileMedia, createImageResponseCache, downloadImageViaPage } = require('./profile-media');
const {
  enrichExperienceCompanyData,
  downloadCompanyLogosForExperience,
} = require('./company-media');
const { mergeExperienceLists, finalizeExperience } = require('./experience-order');
const {
  launchLinkedInBrowser,
  ensureLoggedIn,
  navigateLinkedIn,
  waitForProfileContent,
  sleep,
  LINKEDIN_EMAIL,
} = require('./linkedin-auth');

const DEFAULT_OUTPUT_ROOT = path.join(__dirname, '..', 'profiles');
const NAV_DELAY_MS = 400;
const SCROLL_ROUND_MS = 350;

function resolveDetailPagesMode(options) {
  if (options.detailPagesMode) {
    return options.detailPagesMode;
  }
  if (options.includeDetailPages === false) {
    return 'none';
  }
  if (options.fullDetailPages) {
    return 'full';
  }
  return 'core';
}

function markTiming(timings, label, startMs) {
  timings.push({ label, ms: Date.now() - startMs });
}

function parseProfileInput(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('Profile URL or vanity name is required.');
  }

  const urlMatch = raw.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (urlMatch) {
    const vanityName = decodeURIComponent(urlMatch[1].replace(/\/$/, ''));
    return {
      vanityName,
      profileUrl: `https://www.linkedin.com/in/${vanityName}/`,
    };
  }

  const vanityName = raw.replace(/^@/, '').replace(/\/$/, '');
  return {
    vanityName,
    profileUrl: `https://www.linkedin.com/in/${vanityName}/`,
  };
}

function applyIfEmpty(target, source) {
  if (!source) {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    if (target[key] == null || target[key] === '') {
      target[key] = value;
    }
  }
}

function mergeSection(targetArray, incoming, keyFn) {
  if (!incoming?.length) {
    return;
  }
  targetArray.push(...incoming);
  const merged = mergeUniqueByKey(targetArray, keyFn);
  targetArray.length = 0;
  targetArray.push(...merged);
}

function mergeParsedIntoProfile(profile, parsed) {
  if (!parsed) {
    return;
  }

  if (parsed.identity) {
    const apiPhoto = parsed.identity.profilePhotoUrl;
    const apiBackground = parsed.identity.backgroundPhotoUrl;
    applyIfEmpty(profile.identity, parsed.identity);
    if (apiPhoto) {
      profile.identity.profilePhotoUrl = apiPhoto;
    }
    if (apiBackground) {
      profile.identity.backgroundPhotoUrl = apiBackground;
    }
  }
  if (parsed.stats) {
    applyIfEmpty(profile.stats, parsed.stats);
  }
  if (parsed.contact) {
    applyIfEmpty(profile.contact, parsed.contact);
    if (parsed.contact.phoneNumbers?.length) {
      mergeSection(profile.contact.phoneNumbers, parsed.contact.phoneNumbers, (row) => row);
    }
    if (parsed.contact.websites?.length) {
      mergeSection(profile.contact.websites, parsed.contact.websites, (row) => row);
    }
  }

  if (parsed.experience?.length) {
    profile.experience = mergeExperienceLists(profile.experience, parsed.experience);
  }
  mergeSection(profile.education, parsed.education, (row) =>
    `${row.schoolName}|${row.degreeName}|${row.dateRange?.text || ''}`
  );
  mergeSection(profile.skills, parsed.skills, (row) => row.name);
  mergeSection(profile.certifications, parsed.certifications, (row) =>
    `${row.name}|${row.authority || ''}`
  );
  mergeSection(profile.languages, parsed.languages, (row) => row.name);
  mergeSection(profile.projects, parsed.projects, (row) => row.title);
  mergeSection(profile.volunteering, parsed.volunteering, (row) =>
    `${row.role}|${row.organization || ''}`
  );
  mergeSection(profile.publications, parsed.publications, (row) => row.title);
  mergeSection(profile.patents, parsed.patents, (row) => row.title);
  mergeSection(profile.courses, parsed.courses, (row) => row.name);
  mergeSection(profile.honors, parsed.honors, (row) => row.title);
  mergeSection(profile.organizations, parsed.organizations, (row) => row.name);
  mergeSection(
    profile.recommendations.received,
    parsed.recommendations?.received,
    (row) => `${row.recommender}|${(row.text || '').slice(0, 80)}`
  );
  mergeSection(
    profile.recommendations.given,
    parsed.recommendations?.given,
    (row) => `${row.recipient}|${(row.text || '').slice(0, 80)}`
  );
}

function mergeDomMain(profile, domMain) {
  if (!domMain) {
    return;
  }

  applyIfEmpty(profile.identity, {
    fullName: domMain.h1,
    headline: domMain.headline,
    location: domMain.location,
    summary: domMain.about,
    profilePhotoUrl: domMain.profilePhotoUrl,
    backgroundPhotoUrl: domMain.backgroundPhotoUrl,
  });

  profile.meta.ldJson = domMain.ldJson || [];
  profile.meta.openGraph = domMain.meta || {};

  for (const person of profile.meta.ldJson) {
    if (person['@type'] !== 'Person') {
      continue;
    }
    applyIfEmpty(profile.identity, {
      fullName: person.name,
      headline: person.jobTitle,
      profilePhotoUrl: person.image?.url || person.image,
    });
    if (person.address?.addressLocality) {
      applyIfEmpty(profile.identity, { location: person.address.addressLocality });
    }
  }
}

function mergeDomExperienceRich(profile, items) {
  if (!items?.length) {
    return;
  }
  profile.experience = mergeExperienceLists(profile.experience, items);
  enrichExperienceCompanyData(profile.experience);
}

function mergeDomDetails(profile, domDetails) {
  if (!domDetails?.items?.length) {
    return;
  }

  switch (domDetails.sectionKind) {
    case 'experience':
      profile.experience = mergeExperienceLists(profile.experience, domDetails.items);
      break;
    case 'education':
      mergeSection(profile.education, domDetails.items, (row) =>
        `${row.schoolName}|${row.degreeName}|${row.dateRange?.text || ''}`
      );
      break;
    case 'skills':
      mergeSection(
        profile.skills,
        domDetails.items.map((row) => ({ name: row.name })),
        (row) => row.name
      );
      break;
    default:
      break;
  }
}

async function autoScroll(page, rounds = 4) {
  await page.evaluate(
    async ({ count, roundMs }) => {
      for (let i = 0; i < count; i += 1) {
        window.scrollBy(0, window.innerHeight * 0.85);
        await new Promise((resolve) => setTimeout(resolve, roundMs));
      }
      window.scrollTo(0, 0);
    },
    { count: rounds, roundMs: SCROLL_ROUND_MS }
  );
}

async function scrapeLinkedInProfile(page, options) {
  const { vanityName, profileUrl } = parseProfileInput(options.profile);
  const outputRoot = options.outputRoot || DEFAULT_OUTPUT_ROOT;
  const detailPagesMode = resolveDetailPagesMode(options);
  const detailSections = detailSectionsForMode(detailPagesMode);
  const timings = [];
  const startedAt = Date.now();

  const profile = createEmptyProfile(vanityName, profileUrl);
  const rawResponses = [];
  const domSnapshots = [];
  const visitLog = createVisitLog();
  const networkCapture = createNetworkCapture(page);
  const imageCache = createImageResponseCache(page);

  let phaseStart = Date.now();
  await ensureLoggedIn(page, profileUrl, visitLog);
  await sleep(NAV_DELAY_MS);

  if (page.url().includes('/authwall')) {
    throw new Error('LinkedIn auth wall — log in with npm run connections:download first.');
  }

  await waitForProfileContent(page);
  visitLog.recordPage(page, 'profile-main');
  await autoScroll(page, 4);
  markTiming(timings, 'Main profile page', phaseStart);

  phaseStart = Date.now();
  const domMain = await page.evaluate(scrapeMainProfileDom);
  domSnapshots.push({ label: 'main', ...domMain });
  mergeDomMain(profile, domMain);
  markTiming(timings, 'Main DOM parse', phaseStart);

  phaseStart = Date.now();
  const voyagerEndpoints = buildProfileEndpoints(vanityName, {
    fullApi: options.fullApi === true,
  });
  const voyagerResponses = await voyagerGetMany(page, voyagerEndpoints);
  for (const response of voyagerResponses) {
    rawResponses.push({
      label: response.path.split('?')[0].split('/').slice(-2).join('-'),
      path: response.path,
      status: response.status,
      ok: response.ok,
      body: response.body,
    });

    if (response.ok && response.body) {
      mergeParsedIntoProfile(profile, parseProfileEntities([response.body]));
    }
  }
  markTiming(timings, `Voyager API (${voyagerEndpoints.length} calls)`, phaseStart);

  phaseStart = Date.now();
  const mediaDir = path.join(outputRoot, slugify(vanityName), 'media');
  profile.media = await captureAndDownloadProfileMedia(page, {
    mediaDir,
    visitLog,
    imageCache,
    profilePhotoFallback: profile.identity.profilePhotoUrl,
    backgroundFallback: profile.identity.backgroundPhotoUrl,
  });
  if (profile.media.profilePhoto.sourceUrl) {
    profile.identity.profilePhotoUrl = profile.media.profilePhoto.sourceUrl;
  }
  if (profile.media.backgroundPhoto.sourceUrl) {
    profile.identity.backgroundPhotoUrl = profile.media.backgroundPhoto.sourceUrl;
  }
  markTiming(timings, 'Profile & background photos', phaseStart);

  if (detailSections.length > 0) {
    phaseStart = Date.now();
    for (const section of detailSections) {
      const sectionUrl = `${profileUrl}details/${section.slug}/`;
      await sleep(NAV_DELAY_MS);
      try {
        await navigateLinkedIn(page, sectionUrl, {
          waitSelectors: ['main', 'main h1'],
          timeout: 45000,
          visitLog,
        });
      } catch (err) {
        domSnapshots.push({
          label: `details-${section.slug}`,
          url: sectionUrl,
          sectionKind: section.kind,
          items: [],
          error: err.message,
        });
        continue;
      }

      await autoScroll(page, 3);

      const domDetails = await page.evaluate(scrapeDetailsListDom, section.kind);
      domSnapshots.push({ label: `details-${section.slug}`, url: sectionUrl, ...domDetails });
      mergeDomDetails(profile, domDetails);

      if (section.kind === 'experience') {
        const domRich = await page.evaluate(scrapeExperienceRichDom);
        domSnapshots.push({
          label: `details-${section.slug}-rich`,
          url: sectionUrl,
          sectionKind: 'experience-rich',
          items: domRich,
        });
        mergeDomExperienceRich(profile, domRich);
      }
    }
    markTiming(
      timings,
      `Detail pages (${detailSections.length} visited)`,
      phaseStart
    );
  }

  const captured = networkCapture.getAll();
  networkCapture.detach();
  imageCache.detach();

  for (const capture of captured) {
    if (!capture.body || typeof capture.body !== 'object') {
      continue;
    }
    mergeParsedIntoProfile(profile, parseProfileEntities([capture.body]));
  }

  enrichExperienceCompanyData(profile.experience);
  profile.experience = finalizeExperience(profile.experience);

  phaseStart = Date.now();
  const companiesDir = path.join(outputRoot, slugify(vanityName), 'media', 'companies');
  await downloadCompanyLogosForExperience(page, {
    experience: profile.experience,
    companiesDir,
    visitLog,
    imageCache,
    downloadImageViaPage,
  });
  markTiming(timings, 'Company logos', phaseStart);

  profile.source.scrapedAt = new Date().toISOString();
  profile.source.scrapeDurationMs = Date.now() - startedAt;
  profile.provenance.voyagerResponses = rawResponses.map((row) => ({
    path: row.path,
    status: row.status,
    ok: row.ok,
  }));
  profile.provenance.domSections = domSnapshots.map((row) => row.label || row.sectionKind);
  profile.provenance.networkCaptures = captured.length;
  profile.provenance.visitedUrls = visitLog.list();

  const saved = saveProfileBundle({
    outputRoot,
    vanityName,
    profile,
    rawResponses,
    domSnapshots,
    visitLog: visitLog.list(),
    manifestExtra: {
      capturedNetworkResponses: captured.length,
      detailPagesVisited: detailSections.length,
      detailPagesMode,
    },
  });

  return {
    profile,
    saved,
    capturedCount: captured.length,
    timings,
    detailPagesMode,
    visitedUrls: visitLog.list(),
  };
}

async function scrapeLinkedInProfileWithBrowser(options) {
  if (!LINKEDIN_EMAIL && !process.env.LI_AT) {
    throw new Error('LINKEDIN_EMAIL is not set in .env');
  }

  const browser = await launchLinkedInBrowser({
    headless: options.headless === true,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(90000);
    return await scrapeLinkedInProfile(page, options);
  } finally {
    await browser.close();
  }
}

module.exports = {
  parseProfileInput,
  scrapeLinkedInProfile,
  scrapeLinkedInProfileWithBrowser,
  DEFAULT_OUTPUT_ROOT,
};

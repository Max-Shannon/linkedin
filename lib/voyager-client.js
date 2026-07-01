const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';

const PROFILE_DECORATIONS = [
  'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-118',
  'com.linkedin.voyager.dash.deco.identity.profile.TopCardSupplementary-126',
];

const OPTIONAL_DECORATIONS = [
  'com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-6',
  'com.linkedin.voyager.dash.deco.identity.profile.PrimaryLocale-3',
];

function buildProfileEndpoints(vanityName, options = {}) {
  const encoded = encodeURIComponent(vanityName);
  const base = `/identity/dash/profiles?q=memberIdentity&memberIdentity=${encoded}`;
  const decorations = options.fullApi
    ? [...PROFILE_DECORATIONS, ...OPTIONAL_DECORATIONS]
    : PROFILE_DECORATIONS;

  const endpoints = [
    ...decorations.map(
      (decorationId) => `${base}&decorationId=${encodeURIComponent(decorationId)}`
    ),
    `/identity/profiles/${encoded}/networkinfo`,
  ];

  if (options.fullApi) {
    endpoints.unshift(base);
    endpoints.push(
      `/identity/profiles/${encoded}/skillCategory?includeHiddenEndorsers=true`
    );
  }

  return endpoints;
}

async function fetchVoyagerPaths({ apiBase, paths, staggerMs }) {
  const jsessionCookie = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('JSESSIONID='));
  const csrfToken = jsessionCookie
    ? jsessionCookie.substring('JSESSIONID='.length).replace(/^"|"$/g, '')
    : '';

  const results = [];
  for (const path of paths) {
    if (staggerMs > 0 && results.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, staggerMs));
    }

    const response = await fetch(`${apiBase}${path}`, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      },
      credentials: 'include',
    });

    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch (err) {
      body = { parseError: err.message, rawText: text.slice(0, 5000) };
    }

    results.push({
      ok: response.ok,
      status: response.status,
      path,
      body,
    });
  }

  return results;
}

async function voyagerGet(page, endpoint) {
  const [result] = await voyagerGetMany(page, [endpoint]);
  return result;
}

async function voyagerGetMany(page, endpoints, staggerMs = 150) {
  return page.evaluate(fetchVoyagerPaths, {
    apiBase: VOYAGER_BASE,
    paths: endpoints,
    staggerMs,
  });
}

function createNetworkCapture(page) {
  const captures = [];

  const handler = async (response) => {
    const url = response.url();
    if (!url.includes('linkedin.com')) {
      return;
    }
    if (!/(voyager|graphql|flagship-web)/.test(url)) {
      return;
    }

    try {
      const contentType = response.headers()['content-type'] || '';
      if (!/json|octet-stream|text\/plain/.test(contentType)) {
        return;
      }
      const text = await response.text();
      if (text.length < 40) {
        return;
      }

      let body = null;
      try {
        body = JSON.parse(text);
      } catch (err) {
        body = { rawText: text };
      }

      captures.push({
        url,
        status: response.status(),
        contentType,
        capturedAt: new Date().toISOString(),
        body,
      });
    } catch (err) {
      // Body may be unavailable after navigation.
    }
  };

  page.on('response', handler);

  return {
    getAll() {
      return captures;
    },
    detach() {
      page.off('response', handler);
    },
  };
}

module.exports = {
  VOYAGER_BASE,
  PROFILE_DECORATIONS,
  OPTIONAL_DECORATIONS,
  buildProfileEndpoints,
  voyagerGet,
  voyagerGetMany,
  createNetworkCapture,
};

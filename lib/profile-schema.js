const PROFILE_SCHEMA_VERSION = 1;

function createEmptyProfile(vanityName, profileUrl) {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    source: {
      network: 'linkedin',
      profileUrl,
      vanityName,
      scrapedAt: null,
      scrapeDurationMs: null,
    },
    identity: {
      entityUrn: null,
      publicIdentifier: vanityName,
      firstName: null,
      lastName: null,
      fullName: null,
      headline: null,
      summary: null,
      location: null,
      industry: null,
      profilePhotoUrl: null,
      backgroundPhotoUrl: null,
      pronoun: null,
      openToWork: null,
    },
    stats: {
      connections: null,
      followers: null,
    },
    contact: {
      email: null,
      phoneNumbers: [],
      websites: [],
      twitterHandles: [],
      ims: [],
      address: null,
      birthday: null,
    },
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    projects: [],
    volunteering: [],
    publications: [],
    patents: [],
    courses: [],
    honors: [],
    organizations: [],
    recommendations: {
      received: [],
      given: [],
    },
    interests: [],
    featured: [],
    media: {
      profilePhoto: {
        thumbnailUrl: null,
        modalUrl: null,
        sourceUrl: null,
        localPath: null,
      },
      backgroundPhoto: {
        thumbnailUrl: null,
        modalUrl: null,
        sourceUrl: null,
        localPath: null,
      },
    },
    meta: {
      ldJson: [],
      openGraph: {},
    },
    provenance: {
      voyagerResponses: [],
      domSections: [],
      networkCaptures: 0,
      visitedUrls: [],
    },
  };
}

function mergeUniqueByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

module.exports = {
  PROFILE_SCHEMA_VERSION,
  createEmptyProfile,
  mergeUniqueByKey,
};

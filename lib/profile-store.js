const fs = require('fs');
const path = require('path');
const { writeProfileHtml, stripMediaBuffers } = require('./profile-html');

function slugify(value) {
  return String(value || 'profile')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function saveProfileBundle({ outputRoot, vanityName, profile, rawResponses, domSnapshots, visitLog, manifestExtra }) {
  const profileDir = path.join(outputRoot, slugify(vanityName));
  const rawDir = path.join(profileDir, 'raw');
  const domDir = path.join(profileDir, 'dom');

  ensureDir(rawDir);
  ensureDir(domDir);

  stripMediaBuffers(profile);
  writeJson(path.join(profileDir, 'profile.json'), profile);
  const htmlPath = path.join(profileDir, 'profile.html');
  writeProfileHtml(profile, htmlPath, { profileDir });

  const visitedUrls = visitLog || profile.provenance?.visitedUrls || [];
  if (visitedUrls.length > 0) {
    writeJson(path.join(profileDir, 'urls-visited.json'), visitedUrls);
  }

  const manifest = {
    vanityName,
    profileUrl: profile.source.profileUrl,
    scrapedAt: profile.source.scrapedAt,
    schemaVersion: profile.schemaVersion,
    outputDir: profileDir,
    htmlFile: 'profile.html',
    urlsVisitedFile: visitedUrls.length > 0 ? 'urls-visited.json' : null,
    media: {
      profilePhoto: profile.media?.profilePhoto?.localPath || null,
      backgroundPhoto: profile.media?.backgroundPhoto?.localPath || null,
    },
    rawResponseCount: rawResponses.length,
    domSnapshotCount: domSnapshots.length,
    visitedUrlCount: visitedUrls.length,
    counts: {
      experience: profile.experience.length,
      education: profile.education.length,
      skills: profile.skills.length,
      certifications: profile.certifications.length,
      languages: profile.languages.length,
      projects: profile.projects.length,
      volunteering: profile.volunteering.length,
      publications: profile.publications.length,
      patents: profile.patents.length,
      courses: profile.courses.length,
      honors: profile.honors.length,
      recommendationsReceived: profile.recommendations.received.length,
      recommendationsGiven: profile.recommendations.given.length,
    },
    ...manifestExtra,
  };

  writeJson(path.join(profileDir, 'manifest.json'), manifest);

  for (const [index, response] of rawResponses.entries()) {
    const name = `${String(index).padStart(3, '0')}-${slugify(response.label || response.path || 'response')}.json`;
    writeJson(path.join(rawDir, name), response);
  }

  for (const snapshot of domSnapshots) {
    const name = `${slugify(snapshot.label || snapshot.sectionKind || 'dom')}.json`;
    writeJson(path.join(domDir, name), snapshot);
  }

  return { profileDir, manifest, htmlPath };
}

module.exports = {
  slugify,
  saveProfileBundle,
};

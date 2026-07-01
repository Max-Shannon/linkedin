const fs = require('fs');
const path = require('path');
const { renderProfileHtml } = require('./render-profile-html');

function fileToDataUri(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  const buffer = fs.readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function stripMediaBuffers(profile) {
  if (!profile?.media) {
    return profile;
  }
  for (const key of ['profilePhoto', 'backgroundPhoto']) {
    const capture = profile.media[key]?.capture;
    if (capture?.networkBuffer) {
      delete capture.networkBuffer;
    }
  }
  return profile;
}

function prepareProfileForHtml(profile, profileDir) {
  const prepared = stripMediaBuffers(structuredClone(profile));

  for (const key of ['profilePhoto', 'backgroundPhoto']) {
    const localPath = prepared.media?.[key]?.localPath;
    if (!localPath) {
      continue;
    }
    const dataUri = fileToDataUri(path.join(profileDir, localPath));
    if (dataUri) {
      prepared.media[key].htmlSrc = dataUri;
    }
  }

  for (const entry of prepared.experience || []) {
    if (!entry.companyLogoLocalPath) {
      continue;
    }
    const dataUri = fileToDataUri(path.join(profileDir, entry.companyLogoLocalPath));
    if (dataUri) {
      entry.companyLogoHtmlSrc = dataUri;
    }
  }

  return prepared;
}

function loadProfileJson(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Profile JSON not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function writeProfileHtml(profile, htmlPath, options = {}) {
  const profileDir = options.profileDir || path.dirname(path.resolve(htmlPath));
  const html = renderProfileHtml(prepareProfileForHtml(profile, profileDir));
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');
  return htmlPath;
}

function generateProfileHtmlFromJson(inputPath, outputPath) {
  const profile = loadProfileJson(inputPath);
  const target =
    outputPath ||
    path.join(path.dirname(path.resolve(inputPath)), 'profile.html');
  writeProfileHtml(profile, target);
  return { profile, htmlPath: target };
}

module.exports = {
  loadProfileJson,
  writeProfileHtml,
  generateProfileHtmlFromJson,
  prepareProfileForHtml,
  stripMediaBuffers,
};

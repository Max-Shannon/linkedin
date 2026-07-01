const fs = require('fs');
const path = require('path');
const { slugify } = require('./profile-store');
const { extensionFromUrl } = require('./profile-media');

function companyAssetSlug(entry) {
  if (entry.companyUniversalName) {
    return slugify(entry.companyUniversalName);
  }
  const urnMatch = String(entry.companyUrn || '').match(/:(\d+)$/);
  if (urnMatch) {
    return urnMatch[1];
  }
  return slugify(entry.companyName || 'company');
}

function enrichExperienceCompanyData(experience) {
  if (!Array.isArray(experience) || experience.length === 0) {
    return experience;
  }

  const byUrn = new Map();
  const byName = new Map();

  for (const row of experience) {
    if (row.companyUrn && (row.companyUrl || row.companyLogoUrl)) {
      byUrn.set(row.companyUrn, row);
    }
    if (row.companyName && row.companyUrl) {
      byName.set(String(row.companyName).trim().toLowerCase(), row);
    }
  }

  for (const row of experience) {
    const urnSource = row.companyUrn ? byUrn.get(row.companyUrn) : null;
    const nameSource = row.companyName
      ? byName.get(String(row.companyName).trim().toLowerCase())
      : null;
    const source = urnSource || nameSource;
    if (!source) {
      continue;
    }

    if (!row.companyUrl && source.companyUrl) {
      row.companyUrl = source.companyUrl;
    }
    if (!row.companyLogoUrl && source.companyLogoUrl) {
      row.companyLogoUrl = source.companyLogoUrl;
    }
    if (!row.companyUniversalName && source.companyUniversalName) {
      row.companyUniversalName = source.companyUniversalName;
    }
    if (!row.companyUrn && source.companyUrn) {
      row.companyUrn = source.companyUrn;
    }
    if (!row.companyLogoLocalPath && source.companyLogoLocalPath) {
      row.companyLogoLocalPath = source.companyLogoLocalPath;
    }
  }

  return experience;
}

async function downloadCompanyLogosForExperience(page, options) {
  const {
    experience,
    companiesDir,
    visitLog,
    imageCache,
    downloadImageViaPage,
  } = options;

  enrichExperienceCompanyData(experience);

  const downloaded = new Map();
  fs.mkdirSync(companiesDir, { recursive: true });

  for (const entry of experience) {
    if (!entry.companyLogoUrl) {
      continue;
    }

    const slug = companyAssetSlug(entry);
    const cacheKey = entry.companyUrn || slug;
    if (downloaded.has(cacheKey)) {
      entry.companyLogoLocalPath = downloaded.get(cacheKey);
      continue;
    }

    const ext = extensionFromUrl(entry.companyLogoUrl);
    const localPath = path.join(companiesDir, `${slug}.${ext}`);
    const relativePath = `media/companies/${slug}.${ext}`;

    try {
      await downloadImageViaPage(
        page,
        entry.companyLogoUrl,
        localPath,
        visitLog,
        `company-logo-${slug}`,
        imageCache
      );
      downloaded.set(cacheKey, relativePath);
      entry.companyLogoLocalPath = relativePath;
      visitLog?.record('download-company-logo', entry.companyLogoUrl, {
        company: entry.companyName,
        localPath: relativePath,
      });
    } catch (err) {
      entry.companyLogoDownloadError = err.message;
    }
  }

  enrichExperienceCompanyData(experience);
  return { downloadedCount: downloaded.size };
}

module.exports = {
  companyAssetSlug,
  enrichExperienceCompanyData,
  downloadCompanyLogosForExperience,
};

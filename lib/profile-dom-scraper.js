function scrapeMainProfileDom() {
  const text = (selector) => document.querySelector(selector)?.innerText?.trim() || null;
  const sectionText = (id) => document.getElementById(id)?.innerText?.trim() || null;

  const meta = {};
  for (const node of document.querySelectorAll('meta[name], meta[property]')) {
    const key = node.getAttribute('name') || node.getAttribute('property');
    const content = node.getAttribute('content');
    if (key && content) {
      meta[key] = content;
    }
  }

  const ldJson = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => {
      try {
        return JSON.parse(node.textContent);
      } catch (err) {
        return { parseError: err.message, raw: node.textContent };
      }
    })
    .filter(Boolean);

  const photoCandidates = [...(document.querySelector('.pv-top-card') || document.querySelector('section.artdeco-card') || document)
    .querySelectorAll('img')]
    .map((img) => ({
      alt: img.getAttribute('alt') || '',
      src: img.currentSrc || img.src || '',
    }))
    .filter((row) => /profile|photo/i.test(row.alt) || /profile-displayphoto/.test(row.src));

  function backgroundFromDom() {
    const img =
      document.querySelector('img.profile-background-image') ||
      document.querySelector('.profile-background-image img') ||
      document.querySelector('.pv-top-card-background-image img');
    if (img?.src) {
      return img.currentSrc || img.src;
    }

    const bgEl =
      document.querySelector('.profile-background-image') ||
      document.querySelector('.pv-top-card-background-image');
    if (bgEl) {
      const match = window
        .getComputedStyle(bgEl)
        .backgroundImage.match(/url\(["']?(.*?)["']?\)/i);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  return {
    pageTitle: document.title,
    url: location.href,
    h1: text('h1'),
    headline: text('.text-body-medium'),
    location:
      text('.text-body-small.inline.t-black--light.break-words') ||
      text('[data-test-id="profile-location"]'),
    about: sectionText('about'),
    topCard: document.querySelector('section.artdeco-card')?.innerText?.trim()?.slice(0, 4000) || null,
    sections: {
      experience: sectionText('experience'),
      education: sectionText('education'),
      skills: sectionText('skills'),
      certifications: sectionText('licenses_and_certifications'),
      languages: sectionText('languages'),
      projects: sectionText('projects'),
      volunteering: sectionText('volunteering_experiences'),
      publications: sectionText('publications'),
      patents: sectionText('patents'),
      courses: sectionText('courses'),
      honors: sectionText('honors_and_awards'),
      recommendations: sectionText('recommendations'),
    },
    meta,
    ldJson,
    profilePhotoUrl: photoCandidates[0]?.src || null,
    backgroundPhotoUrl: backgroundFromDom(),
  };
}

function scrapeDetailsListDom(sectionKind) {
  const main = document.querySelector('main');
  if (!main) {
    return { sectionKind, items: [], error: 'main not found' };
  }

  const bodyText = main.innerText || '';
  if (/went wrong|something went wrong|error/i.test(bodyText.slice(0, 500))) {
    return { sectionKind, items: [], error: 'page error' };
  }

  const lines = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const yearRe = /\b(19|20)\d{2}\b/;
  const midDot = '\u00B7';
  const items = [];
  const seen = new Set();

  if (sectionKind === 'skills') {
    for (const line of lines) {
      if (line.length > 80 || line.length < 2) {
        continue;
      }
      if (/^(skills|endorse|show all|see all)/i.test(line)) {
        continue;
      }
      if (/^[\u00B7·]\s*\d/.test(line)) {
        break;
      }
      if (!seen.has(line)) {
        seen.add(line);
        items.push({ name: line });
      }
    }
    return { sectionKind, items };
  }

  for (let idx = 2; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (/^[\u00B7·]\s*\d/.test(line)) {
      break;
    }

    const isPeriod =
      yearRe.test(line) &&
      line.includes(midDot) &&
      (line.includes('\u2013') || line.includes('\u2014') || line.includes('-'));

    if (!isPeriod) {
      continue;
    }

    const companyLine = lines[idx - 1] || '';
    let company = companyLine;
    if (companyLine.includes(midDot) && !yearRe.test(companyLine.split(midDot)[0])) {
      company = companyLine.split(midDot)[0].trim();
    }

    const title = lines[idx - 2] || '';
    if (!title || title.length > 100 || /\+\d+\s+\S+$/.test(title)) {
      continue;
    }

    let location = '';
    if (idx + 1 < lines.length) {
      const next = lines[idx + 1];
      if (next.length < 80 && !yearRe.test(next)) {
        location = next;
      }
    }

    const key = `${title}|${company}|${line}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (sectionKind === 'education') {
      items.push({
        schoolName: company,
        degreeName: title,
        dateRange: { text: line },
        location,
      });
    } else {
      items.push({
        title,
        companyName: company,
        dateRange: { text: line },
        location,
      });
    }
  }

  return { sectionKind, items };
}

function scrapeExperienceRichDom() {
  const items = [];
  const seen = new Set();
  const nodes = new Set();

  for (const selector of [
    'main li.pvs-list__paged-list-item',
    'main .pvs-entity',
    'main ul > li.artdeco-list__item',
  ]) {
    for (const node of document.querySelectorAll(selector)) {
      nodes.add(node);
    }
  }

  for (const node of nodes) {
    const companyLink = node.querySelector('a[href*="/company/"]');
    if (!companyLink) {
      continue;
    }

    const companyUrl = companyLink.href.split('?')[0];
    const img = node.querySelector('img[src*="licdn"]');
    const boldLines = [...node.querySelectorAll('.t-bold, [class*="t-bold"]')]
      .map((el) => el.innerText.trim())
      .filter(Boolean);
    const title = boldLines[0] || '';
    const companyName =
      (companyLink.innerText || '').trim() ||
      boldLines.find((line) => line !== title) ||
      '';

    const key = `${title}|${companyUrl}`;
    if (!title || seen.has(key)) {
      continue;
    }
    seen.add(key);

    items.push({
      title,
      companyName,
      companyUrl,
      companyLogoUrl: img?.currentSrc || img?.src || null,
      dateRange: { text: null },
    });
  }

  return items;
}

const CORE_DETAIL_SECTIONS = [
  { slug: 'experience', kind: 'experience' },
  { slug: 'education', kind: 'education' },
  { slug: 'skills', kind: 'skills' },
];

const EXTRA_DETAIL_SECTIONS = [
  { slug: 'certifications', kind: 'certifications' },
  { slug: 'languages', kind: 'languages' },
  { slug: 'projects', kind: 'projects' },
  { slug: 'volunteering-experiences', kind: 'volunteering' },
  { slug: 'publications', kind: 'publications' },
  { slug: 'patents', kind: 'patents' },
  { slug: 'courses', kind: 'courses' },
  { slug: 'honors', kind: 'honors' },
  { slug: 'recommendations', kind: 'recommendations' },
];

const DETAIL_SECTIONS = [...CORE_DETAIL_SECTIONS, ...EXTRA_DETAIL_SECTIONS];

function detailSectionsForMode(mode) {
  if (mode === 'none') {
    return [];
  }
  if (mode === 'full') {
    return DETAIL_SECTIONS;
  }
  return CORE_DETAIL_SECTIONS;
}

module.exports = {
  scrapeMainProfileDom,
  scrapeDetailsListDom,
  scrapeExperienceRichDom,
  CORE_DETAIL_SECTIONS,
  EXTRA_DETAIL_SECTIONS,
  DETAIL_SECTIONS,
  detailSectionsForMode,
};

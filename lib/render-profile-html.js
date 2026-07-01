function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateRange(dateRange) {
  if (!dateRange) {
    return '';
  }
  if (dateRange.text) {
    return dateRange.text;
  }
  const start = dateRange.start || '';
  const end = dateRange.end || 'Present';
  if (start && end) {
    return `${start} – ${end}`;
  }
  return start || end || '';
}

function hasItems(list) {
  return Array.isArray(list) && list.length > 0;
}

function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function renderNav(profile) {
  const links = [
    ['about', 'About', profile.identity.summary],
    ['experience', 'Experience', hasItems(profile.experience)],
    ['education', 'Education', hasItems(profile.education)],
    ['skills', 'Skills', hasItems(profile.skills)],
    ['certifications', 'Certifications', hasItems(profile.certifications)],
    ['languages', 'Languages', hasItems(profile.languages)],
    ['projects', 'Projects', hasItems(profile.projects)],
    ['volunteering', 'Volunteering', hasItems(profile.volunteering)],
    ['publications', 'Publications', hasItems(profile.publications)],
    ['patents', 'Patents', hasItems(profile.patents)],
    ['courses', 'Courses', hasItems(profile.courses)],
    ['honors', 'Honors', hasItems(profile.honors)],
    ['recommendations', 'Recommendations', hasItems(profile.recommendations.received) || hasItems(profile.recommendations.given)],
    ['contact', 'Contact', profile.contact.email || hasItems(profile.contact.websites)],
  ].filter(([, , visible]) => visible);

  return links
    .map(([id, label]) => `<a href="#${id}" class="nav-link">${escapeHtml(label)}</a>`)
    .join('');
}

function renderCompanyLogo(item) {
  const logoSrc =
    item.companyLogoHtmlSrc ||
    item.companyLogoLocalPath ||
    item.companyLogoUrl ||
    '';
  if (!logoSrc) {
    return '<div class="company-logo company-logo-fallback" aria-hidden="true"></div>';
  }
  const alt = escapeHtml(item.companyName || item.companyLinkedInName || 'Company');
  const img = `<img class="company-logo" src="${escapeHtml(logoSrc)}" alt="${alt}" loading="lazy" />`;
  if (item.companyUrl) {
    return `<a class="company-logo-link" href="${escapeHtml(item.companyUrl)}" target="_blank" rel="noopener noreferrer">${img}</a>`;
  }
  return img;
}

function renderLinkedCompanyName(item) {
  const name = item.companyName || item.companyLinkedInName || '';
  if (!name) {
    return '';
  }
  if (item.companyUrl) {
    return `<a class="timeline-org-link" href="${escapeHtml(item.companyUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`;
  }
  return escapeHtml(name);
}

function renderTimeline(items, type) {
  return items
    .map((item) => {
      if (type === 'experience') {
        return `
          <article class="timeline-item">
            <div class="timeline-logo-wrap">
              ${renderCompanyLogo(item)}
            </div>
            <div class="timeline-card">
              <div class="timeline-head">
                <h3>${escapeHtml(item.title || 'Role')}</h3>
                <span class="timeline-date">${escapeHtml(formatDateRange(item.dateRange))}</span>
              </div>
              <p class="timeline-org">${renderLinkedCompanyName(item)}</p>
              ${item.employmentType ? `<p class="timeline-meta">${escapeHtml(item.employmentType)}</p>` : ''}
              ${item.location ? `<p class="timeline-meta">${escapeHtml(item.location)}</p>` : ''}
              ${item.description ? `<p class="timeline-body">${escapeHtml(item.description)}</p>` : ''}
            </div>
          </article>`;
      }

      return `
        <article class="timeline-item">
          <div class="timeline-marker" aria-hidden="true"></div>
          <div class="timeline-card">
            <div class="timeline-head">
              <h3>${escapeHtml(item.schoolName || 'School')}</h3>
              <span class="timeline-date">${escapeHtml(formatDateRange(item.dateRange))}</span>
            </div>
            <p class="timeline-org">${escapeHtml([item.degreeName, item.fieldOfStudy].filter(Boolean).join(' · '))}</p>
            ${item.grade ? `<p class="timeline-meta">Grade: ${escapeHtml(item.grade)}</p>` : ''}
            ${item.description ? `<p class="timeline-body">${escapeHtml(item.description)}</p>` : ''}
          </div>
        </article>`;
    })
    .join('');
}

function renderSkillPills(skills) {
  return skills
    .map((skill) => {
      const endorse =
        skill.endorsementCount != null
          ? `<span class="skill-count">${escapeHtml(skill.endorsementCount)}</span>`
          : '';
      return `<span class="skill-pill">${escapeHtml(skill.name || 'Skill')}${endorse}</span>`;
    })
    .join('');
}

function renderSimpleCards(items, mapFn) {
  return `<div class="card-grid">${items.map(mapFn).join('')}</div>`;
}

function renderRecommendations(recommendations) {
  const blocks = [];

  if (hasItems(recommendations.received)) {
    blocks.push(`
      <div class="rec-group">
        <h3 class="rec-heading">Received</h3>
        ${recommendations.received
          .map(
            (rec) => `
          <blockquote class="quote-card">
            <p>${escapeHtml(rec.text || '')}</p>
            <footer>${escapeHtml(rec.recommender || 'Anonymous')}${rec.relationship ? ` · ${escapeHtml(rec.relationship)}` : ''}</footer>
          </blockquote>`
          )
          .join('')}
      </div>`);
  }

  if (hasItems(recommendations.given)) {
    blocks.push(`
      <div class="rec-group">
        <h3 class="rec-heading">Given</h3>
        ${recommendations.given
          .map(
            (rec) => `
          <blockquote class="quote-card">
            <p>${escapeHtml(rec.text || '')}</p>
            <footer>${escapeHtml(rec.recipient || 'Anonymous')}${rec.relationship ? ` · ${escapeHtml(rec.relationship)}` : ''}</footer>
          </blockquote>`
          )
          .join('')}
      </div>`);
  }

  return blocks.join('');
}

function renderProfileHtml(profile) {
  const identity = profile.identity || {};
  const stats = profile.stats || {};
  const contact = profile.contact || {};
  const source = profile.source || {};
  const name = identity.fullName || identity.publicIdentifier || 'Profile';
  const scrapedLabel = source.scrapedAt
    ? new Date(source.scrapedAt).toLocaleString()
    : 'Unknown';
  const media = profile.media || {};
  const photoUrl =
    media.profilePhoto?.htmlSrc ||
    media.profilePhoto?.localPath ||
    media.profilePhoto?.sourceUrl ||
    identity.profilePhotoUrl ||
    '';
  const coverImageUrl =
    media.backgroundPhoto?.htmlSrc ||
    media.backgroundPhoto?.localPath ||
    media.backgroundPhoto?.sourceUrl ||
    identity.backgroundPhotoUrl ||
    '';
  const coverBackground = coverImageUrl
    ? `linear-gradient(180deg, rgba(6,10,18,0.35), rgba(6,10,18,0.92)), url('${escapeHtml(coverImageUrl)}')`
    : 'linear-gradient(135deg, rgba(55,143,233,0.35), rgba(34,211,238,0.18) 45%, rgba(167,139,250,0.22))';

  const statCards = [
    stats.connections != null
      ? `<div class="stat"><strong>${escapeHtml(stats.connections.toLocaleString())}</strong><span>Connections</span></div>`
      : '',
    stats.followers != null
      ? `<div class="stat"><strong>${escapeHtml(stats.followers.toLocaleString())}</strong><span>Followers</span></div>`
      : '',
    hasItems(profile.experience)
      ? `<div class="stat"><strong>${profile.experience.length}</strong><span>Roles</span></div>`
      : '',
    hasItems(profile.skills)
      ? `<div class="stat"><strong>${profile.skills.length}</strong><span>Skills</span></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const contactRows = [
    contact.email ? `<li><span>Email</span><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></li>` : '',
    ...(contact.phoneNumbers || []).map(
      (phone) => `<li><span>Phone</span><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></li>`
    ),
    ...(contact.websites || []).map(
      (site) => `<li><span>Web</span><a href="${escapeHtml(site)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site)}</a></li>`
    ),
    ...(contact.twitterHandles || []).map(
      (handle) => `<li><span>Twitter</span>${escapeHtml(handle)}</li>`
    ),
  ]
    .filter(Boolean)
    .join('');

  const section = (id, title, subtitle, body, hidden = false) => {
    if (hidden) {
      return '';
    }
    return `
      <section id="${id}" class="section">
        <div class="section-head">
          <span class="section-kicker">${escapeHtml(id)}</span>
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="section-sub">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        ${body}
      </section>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(name)} — Profile Export</title>
  <meta name="description" content="${escapeHtml(identity.headline || name)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #060a12;
      --bg-soft: #0c1220;
      --card: rgba(14, 22, 38, 0.78);
      --card-strong: rgba(18, 28, 48, 0.94);
      --border: rgba(148, 163, 184, 0.14);
      --text: #eef3fb;
      --muted: #94a3b8;
      --dim: #64748b;
      --accent: #378fe9;
      --accent-2: #22d3ee;
      --accent-3: #a78bfa;
      --gold: #fbbf24;
      --shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
      --radius: 22px;
      --radius-sm: 14px;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 96px; }
    body {
      margin: 0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
      text-rendering: optimizeLegibility;
    }

    .mesh {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      background:
        radial-gradient(circle at 12% 18%, rgba(55, 143, 233, 0.18), transparent 28%),
        radial-gradient(circle at 88% 12%, rgba(34, 211, 238, 0.12), transparent 24%),
        radial-gradient(circle at 70% 82%, rgba(167, 139, 250, 0.1), transparent 30%),
        linear-gradient(180deg, #060a12, #0a101c 40%, #060a12);
    }

    .page {
      position: relative;
      z-index: 1;
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 24px 80px;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 0;
      backdrop-filter: blur(16px);
      background: rgba(6, 10, 18, 0.72);
      border-bottom: 1px solid transparent;
    }

    .topbar.scrolled { border-bottom-color: var(--border); }

    .brand {
      font-weight: 700;
      font-size: 0.92rem;
      color: var(--muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .nav-link {
      color: var(--muted);
      text-decoration: none;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 999px;
      transition: background 0.2s, color 0.2s;
    }

    .nav-link:hover {
      color: var(--text);
      background: rgba(255,255,255,0.06);
    }

    .hero {
      margin-top: 18px;
      border-radius: calc(var(--radius) + 4px);
      overflow: hidden;
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      background: var(--card-strong);
    }

    .hero-cover {
      height: 220px;
      background-image: ${coverBackground};
      background-size: cover;
      background-position: center;
    }

    .hero-body {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 28px;
      padding: 0 32px 32px;
      margin-top: -56px;
      align-items: end;
    }

    .avatar-wrap { position: relative; }
    .avatar, .avatar-fallback {
      width: 120px;
      height: 120px;
      border-radius: 28px;
      border: 4px solid var(--bg-soft);
      box-shadow: 0 16px 40px rgba(0,0,0,0.35);
      object-fit: cover;
      background: linear-gradient(135deg, #1d4ed8, #0891b2);
    }

    .avatar-fallback {
      display: grid;
      place-items: center;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      font-size: 2rem;
      font-weight: 700;
      color: white;
    }

    .hero-copy h1 {
      font-family: 'Space Grotesk', system-ui, sans-serif;
      font-size: clamp(2rem, 4vw, 3.2rem);
      line-height: 1.08;
      margin: 0 0 10px;
      letter-spacing: -0.03em;
      font-weight: 700;
    }

    .headline {
      font-size: 1.08rem;
      color: #cfe3ff;
      margin: 0 0 12px;
      max-width: 760px;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
      color: var(--muted);
      font-size: 0.92rem;
      margin-bottom: 18px;
    }

    .meta-row a { color: var(--accent-2); text-decoration: none; }
    .meta-row a:hover { text-decoration: underline; }

    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .stat {
      min-width: 110px;
      padding: 14px 16px;
      border-radius: var(--radius-sm);
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border);
    }

    .stat strong {
      display: block;
      font-size: 1.35rem;
      color: var(--accent);
      margin-bottom: 2px;
    }

    .stat span {
      font-size: 0.78rem;
      color: var(--dim);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 24px;
      margin-top: 28px;
    }

    .main-col { min-width: 0; }

    .section {
      margin-bottom: 24px;
      padding: 28px;
      border-radius: var(--radius);
      background: var(--card);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
    }

    .section-head { margin-bottom: 22px; }
    .section-kicker {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent-2);
      margin-bottom: 8px;
    }

    .section h2 {
      font-family: 'Space Grotesk', system-ui, sans-serif;
      font-size: 1.7rem;
      margin: 0;
      letter-spacing: -0.025em;
      font-weight: 700;
    }

    .section-sub {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 0.95rem;
    }

    .about-text {
      font-size: 1.02rem;
      color: #d7e0ee;
      white-space: pre-wrap;
      margin: 0;
    }

    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
      position: relative;
    }

    .timeline-item {
      display: grid;
      grid-template-columns: 56px 1fr;
      gap: 18px;
      padding-bottom: 22px;
      position: relative;
    }

    .timeline-item:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 24px;
      top: 52px;
      bottom: 0;
      width: 2px;
      background: linear-gradient(180deg, rgba(55,143,233,0.5), rgba(55,143,233,0.05));
    }

    .timeline-logo-wrap {
      padding-top: 4px;
    }

    .company-logo-link {
      display: block;
      line-height: 0;
    }

    .company-logo,
    .company-logo-fallback {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      object-fit: cover;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.06);
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }

    .company-logo-fallback {
      background: linear-gradient(135deg, rgba(55,143,233,0.35), rgba(34,211,238,0.18));
    }

    .timeline-marker {
      width: 18px;
      height: 18px;
      margin-top: 6px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: 0 0 0 6px rgba(55,143,233,0.12);
    }

    .timeline-org-link {
      color: var(--accent-2);
      text-decoration: none;
      font-weight: 600;
    }

    .timeline-org-link:hover {
      text-decoration: underline;
    }

    .timeline-card {
      padding: 18px 20px;
      border-radius: var(--radius-sm);
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
    }

    .timeline-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .timeline-head h3 {
      margin: 0;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .timeline-date {
      color: var(--accent-2);
      font-size: 0.82rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .timeline-org {
      margin: 8px 0 0;
      color: #cfe3ff;
      font-weight: 600;
    }

    .timeline-meta {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .timeline-body {
      margin: 12px 0 0;
      color: #cbd5e1;
      font-size: 0.94rem;
      white-space: pre-wrap;
    }

    .skill-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .skill-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(55,143,233,0.12);
      border: 1px solid rgba(55,143,233,0.22);
      color: #dbeafe;
      font-size: 0.88rem;
      font-weight: 600;
    }

    .skill-count {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      color: var(--gold);
      font-size: 0.72rem;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }

    .mini-card {
      padding: 18px;
      border-radius: var(--radius-sm);
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
    }

    .mini-card h3 {
      margin: 0 0 8px;
      font-size: 1rem;
    }

    .mini-card p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .quote-card {
      margin: 0 0 14px;
      padding: 20px 22px;
      border-left: 4px solid var(--accent);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      background: rgba(255,255,255,0.03);
    }

    .quote-card p {
      margin: 0 0 12px;
      font-size: 1rem;
      color: #dbe4f0;
    }

    .quote-card footer {
      color: var(--muted);
      font-size: 0.88rem;
      font-weight: 600;
    }

    .rec-group + .rec-group { margin-top: 22px; }
    .rec-heading {
      margin: 0 0 12px;
      font-size: 0.92rem;
      color: var(--accent-2);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .sidebar-card {
      position: sticky;
      top: 88px;
      padding: 22px;
      border-radius: var(--radius);
      background: var(--card);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
    }

    .sidebar-card h3 {
      margin: 0 0 16px;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      font-size: 1.15rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .contact-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .contact-list li {
      display: grid;
      gap: 4px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.9rem;
    }

    .contact-list li:last-child { border-bottom: none; }
    .contact-list span {
      color: var(--dim);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }

    .contact-list a {
      color: var(--accent-2);
      text-decoration: none;
      word-break: break-all;
    }

    .export-meta {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--dim);
      font-size: 0.78rem;
      line-height: 1.5;
    }

    .footer {
      margin-top: 28px;
      text-align: center;
      color: var(--dim);
      font-size: 0.82rem;
    }

    @media (max-width: 920px) {
      .hero-body { grid-template-columns: 1fr; margin-top: -40px; }
      .layout { grid-template-columns: 1fr; }
      .sidebar-card { position: static; }
      .nav { display: none; }
    }
  </style>
</head>
<body>
  <div class="mesh" aria-hidden="true"></div>
  <div class="page">
    <header class="topbar" id="topbar">
      <div class="brand">Profile Export · ${escapeHtml(source.network || 'linkedin')}</div>
      <nav class="nav" aria-label="Profile sections">${renderNav(profile)}</nav>
    </header>

    <section class="hero">
      <div class="hero-cover" aria-hidden="true"></div>
      <div class="hero-body">
        <div class="avatar-wrap">
          ${
            photoUrl
              ? `<img class="avatar" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)}" />`
              : `<div class="avatar-fallback" aria-hidden="true">${escapeHtml(initials(name))}</div>`
          }
        </div>
        <div class="hero-copy">
          <h1>${escapeHtml(name)}</h1>
          ${identity.headline ? `<p class="headline">${escapeHtml(identity.headline)}</p>` : ''}
          <div class="meta-row">
            ${identity.location ? `<span>${escapeHtml(identity.location)}</span>` : ''}
            ${identity.industry ? `<span>${escapeHtml(identity.industry)}</span>` : ''}
            ${source.profileUrl ? `<a href="${escapeHtml(source.profileUrl)}" target="_blank" rel="noopener noreferrer">View on LinkedIn</a>` : ''}
          </div>
          ${statCards ? `<div class="stats">${statCards}</div>` : ''}
        </div>
      </div>
    </section>

    <div class="layout">
      <main class="main-col">
        ${section(
          'about',
          'About',
          'Professional summary',
          `<p class="about-text">${escapeHtml(identity.summary || 'No summary available.')}</p>`,
          !identity.summary
        )}
        ${section(
          'experience',
          'Experience',
          `${profile.experience.length} roles`,
          `<div class="timeline">${renderTimeline(profile.experience, 'experience')}</div>`,
          !hasItems(profile.experience)
        )}
        ${section(
          'education',
          'Education',
          `${profile.education.length} schools`,
          `<div class="timeline">${renderTimeline(profile.education, 'education')}</div>`,
          !hasItems(profile.education)
        )}
        ${section(
          'skills',
          'Skills',
          `${profile.skills.length} listed`,
          `<div class="skill-cloud">${renderSkillPills(profile.skills)}</div>`,
          !hasItems(profile.skills)
        )}
        ${section(
          'certifications',
          'Licenses & Certifications',
          null,
          renderSimpleCards(profile.certifications, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.name || 'Certification')}</h3>
              ${item.authority ? `<p>${escapeHtml(item.authority)}</p>` : ''}
              ${formatDateRange(item.dateRange) ? `<p>${escapeHtml(formatDateRange(item.dateRange))}</p>` : ''}
              ${item.licenseNumber ? `<p>License ${escapeHtml(item.licenseNumber)}</p>` : ''}
            </article>`),
          !hasItems(profile.certifications)
        )}
        ${section(
          'languages',
          'Languages',
          null,
          renderSimpleCards(profile.languages, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.name || 'Language')}</h3>
              ${item.proficiency ? `<p>${escapeHtml(item.proficiency)}</p>` : ''}
            </article>`),
          !hasItems(profile.languages)
        )}
        ${section(
          'projects',
          'Projects',
          null,
          renderSimpleCards(profile.projects, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.title || 'Project')}</h3>
              ${formatDateRange(item.dateRange) ? `<p>${escapeHtml(formatDateRange(item.dateRange))}</p>` : ''}
              ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
              ${item.url ? `<p><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></p>` : ''}
            </article>`),
          !hasItems(profile.projects)
        )}
        ${section(
          'volunteering',
          'Volunteering',
          null,
          renderSimpleCards(profile.volunteering, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.role || 'Volunteer')}</h3>
              ${item.organization ? `<p>${escapeHtml(item.organization)}</p>` : ''}
              ${item.cause ? `<p>${escapeHtml(item.cause)}</p>` : ''}
              ${formatDateRange(item.dateRange) ? `<p>${escapeHtml(formatDateRange(item.dateRange))}</p>` : ''}
            </article>`),
          !hasItems(profile.volunteering)
        )}
        ${section(
          'publications',
          'Publications',
          null,
          renderSimpleCards(profile.publications, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.title || 'Publication')}</h3>
              ${item.publisher ? `<p>${escapeHtml(item.publisher)}</p>` : ''}
              ${item.date ? `<p>${escapeHtml(item.date)}</p>` : ''}
            </article>`),
          !hasItems(profile.publications)
        )}
        ${section(
          'patents',
          'Patents',
          null,
          renderSimpleCards(profile.patents, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.title || 'Patent')}</h3>
              ${item.patentNumber ? `<p>${escapeHtml(item.patentNumber)}</p>` : ''}
            </article>`),
          !hasItems(profile.patents)
        )}
        ${section(
          'courses',
          'Courses',
          null,
          renderSimpleCards(profile.courses, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.name || 'Course')}</h3>
              ${item.number ? `<p>${escapeHtml(item.number)}</p>` : ''}
            </article>`),
          !hasItems(profile.courses)
        )}
        ${section(
          'honors',
          'Honors & Awards',
          null,
          renderSimpleCards(profile.honors, (item) => `
            <article class="mini-card">
              <h3>${escapeHtml(item.title || 'Honor')}</h3>
              ${item.issuer ? `<p>${escapeHtml(item.issuer)}</p>` : ''}
              ${item.date ? `<p>${escapeHtml(item.date)}</p>` : ''}
            </article>`),
          !hasItems(profile.honors)
        )}
        ${section(
          'recommendations',
          'Recommendations',
          null,
          renderRecommendations(profile.recommendations),
          !hasItems(profile.recommendations.received) && !hasItems(profile.recommendations.given)
        )}
      </main>

      <aside>
        ${section(
          'contact',
          'Contact & Links',
          null,
          `<ul class="contact-list">${contactRows || '<li><span>Info</span>No public contact details captured.</li>'}</ul>`,
          false
        )}
        <div class="sidebar-card export-meta">
          <strong>Export details</strong><br />
          Scraped: ${escapeHtml(scrapedLabel)}<br />
          Vanity: ${escapeHtml(identity.publicIdentifier || source.vanityName || '')}<br />
          Schema v${escapeHtml(profile.schemaVersion || 1)}
        </div>
      </aside>
    </div>

    <footer class="footer">
      Generated locally from LinkedIn Connection Cleaner · Portable profile export
    </footer>
  </div>
  <script>
    window.addEventListener('scroll', function () {
      document.getElementById('topbar').classList.toggle('scrolled', window.scrollY > 24);
    });
  </script>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  formatDateRange,
  renderProfileHtml,
};

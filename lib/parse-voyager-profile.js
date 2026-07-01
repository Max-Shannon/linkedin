function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isObject(value)) {
    if (typeof value.text === 'string') {
      return textValue(value.text);
    }
    if (value.localized && isObject(value.localized)) {
      const first = Object.values(value.localized).find((entry) => entry?.value);
      if (first?.value) {
        return textValue(first.value);
      }
    }
    if (typeof value.accessibilityText === 'string') {
      return textValue(value.accessibilityText);
    }
  }
  return null;
}

function collectObjects(root, out = []) {
  if (Array.isArray(root)) {
    for (const item of root) {
      collectObjects(item, out);
    }
    return out;
  }

  if (!isObject(root)) {
    return out;
  }

  if (root.$type || root.entityUrn) {
    out.push(root);
  }

  for (const value of Object.values(root)) {
    collectObjects(value, out);
  }

  return out;
}

function indexEntities(payloads) {
  const byUrn = new Map();
  const byType = new Map();

  for (const payload of payloads) {
    if (!payload) {
      continue;
    }

    const objects = collectObjects(payload);
    for (const obj of objects) {
      if (obj.entityUrn) {
        byUrn.set(obj.entityUrn, obj);
      }
      if (obj.$type) {
        const shortType = obj.$type.split('.').pop();
        if (!byType.has(shortType)) {
          byType.set(shortType, []);
        }
        byType.get(shortType).push(obj);
      }
    }
  }

  return { byUrn, byType };
}

function resolveRef(ref, byUrn) {
  if (!ref) {
    return null;
  }
  if (typeof ref === 'string') {
    return byUrn.get(ref) || null;
  }
  if (isObject(ref) && ref.entityUrn) {
    return byUrn.get(ref.entityUrn) || ref;
  }
  return null;
}

function parseDatePart(value) {
  if (!isObject(value)) {
    return null;
  }
  const year = value.year ?? null;
  if (!year) {
    return null;
  }
  return {
    year,
    month: value.month ?? null,
    day: value.day ?? null,
  };
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatDatePart(part) {
  if (!part?.year) {
    return null;
  }
  if (part.month) {
    return `${MONTH_LABELS[part.month - 1]} ${part.year}`;
  }
  return String(part.year);
}

function formatDuration(startPart, endPart) {
  if (!startPart?.year) {
    return null;
  }
  const end =
    endPart?.year != null
      ? { year: endPart.year, month: endPart.month || 12 }
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  const startMonths = startPart.year * 12 + (startPart.month || 1) - 1;
  const endMonths = end.year * 12 + end.month - 1;
  const totalMonths = Math.max(0, endMonths - startMonths + 1);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const chunks = [];
  if (years > 0) {
    chunks.push(`${years} yr${years === 1 ? '' : 's'}`);
  }
  if (months > 0) {
    chunks.push(`${months} mo${months === 1 ? '' : 's'}`);
  }
  return chunks.join(' ') || null;
}

function sortKeyForDatePart(part, fallback = 0) {
  if (!part?.year) {
    return fallback;
  }
  return part.year * 100 + (part.month || 1);
}

function parseDateRange(dateRange) {
  if (!isObject(dateRange)) {
    return {
      start: null,
      end: null,
      text: null,
      sortStart: null,
      sortEnd: null,
      isCurrent: false,
    };
  }

  const startPart =
    parseDatePart(dateRange.start) ||
    parseDatePart(dateRange.startDate) ||
    null;
  const endPart =
    parseDatePart(dateRange.end) ||
    parseDatePart(dateRange.endDate) ||
    null;
  const isCurrent = Boolean(startPart && !endPart);

  const startLabel = formatDatePart(startPart);
  const endLabel = endPart ? formatDatePart(endPart) : startPart ? 'Present' : null;
  const duration = formatDuration(startPart, endPart);

  let text = textValue(dateRange);
  if (!text && startLabel) {
    text = endLabel ? `${startLabel} - ${endLabel}` : startLabel;
    if (duration) {
      text += ` · ${duration}`;
    }
  }

  return {
    start: startPart
      ? `${startPart.year}-${String(startPart.month || 1).padStart(2, '0')}`
      : null,
    end: endPart
      ? `${endPart.year}-${String(endPart.month || 12).padStart(2, '0')}`
      : null,
    text,
    sortStart: sortKeyForDatePart(startPart),
    sortEnd: endPart ? sortKeyForDatePart(endPart, 0) : isCurrent ? 999912 : null,
    isCurrent,
  };
}

function mapPositionRow(row, byUrn) {
  return {
    title: textValue(row.title) || textValue(row.multiLocaleTitle),
    companyName:
      textValue(row.companyName) ||
      textValue(row.company?.name) ||
      textValue(row.company),
    ...companyFieldsFromPosition(row, byUrn),
    employmentType: textValue(row.employmentType),
    location: textValue(row.geoLocationName) || textValue(row.locationName),
    description:
      textValue(row.description) ||
      textValue(row.multiLocaleDescription?.en_US) ||
      textValue(row.multiLocaleDescription),
    dateRange: parseDateRange(row.dateRange || row.timePeriod),
    entityUrn: row.entityUrn || null,
  };
}

function orderedExperienceFromPayload(byUrn, byType) {
  const collections = byType.get('CollectionResponse') || [];
  const groupsInjection = collections.find((row) =>
    row.$recipeTypes?.some((name) => name.includes('FullProfilePositionGroupsInjection'))
  );
  const groupUrns = groupsInjection?.['*elements'] || groupsInjection?.elements || [];

  const experience = [];
  const seen = new Set();

  for (const groupUrn of groupUrns) {
    const group = byUrn.get(groupUrn);
    if (!group) {
      continue;
    }
    const collectionUrn = group['*profilePositionInPositionGroup'];
    if (!collectionUrn) {
      continue;
    }
    const positionsCollection = byUrn.get(collectionUrn);
    const positionUrns =
      positionsCollection?.['*elements'] || positionsCollection?.elements || [];
    for (const positionUrn of positionUrns) {
      const row = byUrn.get(positionUrn);
      if (!row || !row.entityUrn || seen.has(positionUrn)) {
        continue;
      }
      seen.add(positionUrn);
      experience.push(mapPositionRow(row, byUrn));
    }
  }

  for (const row of byType.get('Position') || []) {
    if (row.entityUrn && seen.has(row.entityUrn)) {
      continue;
    }
    experience.push(mapPositionRow(row, byUrn));
  }

  return experience;
}

function vectorImageUrl(vectorImage) {
  if (!vectorImage?.rootUrl || !vectorImage?.artifacts?.length) {
    return null;
  }
  const artifact = vectorImage.artifacts.reduce((best, current) => {
    const score = (current.width || 0) * (current.height || 0);
    const bestScore = (best.width || 0) * (best.height || 0);
    return score > bestScore ? current : best;
  });
  return `${vectorImage.rootUrl}${artifact.fileIdentifyingUrlPathSegment}`;
}

function companyFieldsFromPosition(row, byUrn) {
  const companyUrn = row.companyUrn || row['*company'] || null;
  const company = resolveRef(companyUrn, byUrn);
  const universalName = textValue(company?.universalName) || null;
  let companyUrl = textValue(company?.url) || null;
  if (!companyUrl && universalName) {
    companyUrl = `https://www.linkedin.com/company/${universalName}/`;
  }

  return {
    companyUrn,
    companyUrl,
    companyLogoUrl: company ? vectorImageUrl(company.logo?.vectorImage) : null,
    companyUniversalName: universalName,
    companyLinkedInName: company ? textValue(company.name) : null,
  };
}

function parseProfileEntities(payloads) {
  const { byUrn, byType } = indexEntities(payloads);
  const profiles = byType.get('Profile') || [];
  const profile = profiles[0] || null;

  const identity = profile
    ? {
        entityUrn: profile.entityUrn || null,
        publicIdentifier: profile.publicIdentifier || null,
        firstName: textValue(profile.firstName),
        lastName: textValue(profile.lastName),
        fullName:
          textValue(profile.fullName) ||
          [textValue(profile.firstName), textValue(profile.lastName)]
            .filter(Boolean)
            .join(' ') ||
          null,
        headline: textValue(profile.headline),
        summary: textValue(profile.summary) || textValue(profile.about),
        location: textValue(profile.locationName) || textValue(profile.geoLocationName),
        industry: textValue(profile.industryName) || textValue(profile.industry),
        profilePhotoUrl:
          vectorImageUrl(profile.profilePicture?.displayImageReference?.vectorImage) ||
          textValue(profile.pictureInfo?.url),
        backgroundPhotoUrl:
          vectorImageUrl(profile.backgroundPicture?.displayImageReference?.vectorImage) ||
          textValue(profile.backgroundPicture?.displayImageReference),
        pronoun: textValue(profile.pronoun),
        openToWork: profile.openToWork ?? null,
      }
    : null;

  const stats = profile
    ? {
        connections:
          profile.connections?.paging?.total ??
          profile.connections?.total ??
          profile.connectionsCount ??
          null,
        followers:
          profile.followingState?.followerCount ??
          profile.followerCount ??
          null,
      }
    : { connections: null, followers: null };

  const contact = profile
    ? {
        email: textValue(profile.emailAddress?.emailAddress) || textValue(profile.emailAddress),
        phoneNumbers: (profile.phoneNumbers || [])
          .map((row) => textValue(row.number) || textValue(row))
          .filter(Boolean),
        websites: (profile.websites || profile.creatorWebsite?.attributesV2 || [])
          .map((row) =>
            textValue(row.url) ||
            textValue(row.detailDataUnion?.hyperlink) ||
            textValue(row)
          )
          .filter(Boolean),
        twitterHandles: (profile.twitterHandles || [])
          .map((row) => textValue(row.name) || textValue(row))
          .filter(Boolean),
        ims: (profile.ims || [])
          .map((row) => textValue(row.provider) || textValue(row))
          .filter(Boolean),
        address: textValue(profile.address),
        birthday: textValue(profile.birthDateOn),
      }
    : null;

  const experience = orderedExperienceFromPayload(byUrn, byType);

  const education = (byType.get('Education') || []).map((row) => ({
    schoolName:
      textValue(row.schoolName) ||
      textValue(row.school?.name) ||
      textValue(row.school),
    degreeName: textValue(row.degreeName) || textValue(row.degree),
    fieldOfStudy: textValue(row.fieldOfStudy),
    grade: textValue(row.grade),
    description: textValue(row.description),
    dateRange: parseDateRange(row.dateRange || row.timePeriod),
    entityUrn: row.entityUrn || null,
  }));

  const skills = (byType.get('Skill') || []).map((row) => ({
    name: textValue(row.name) || textValue(row.skill?.name),
    endorsementCount: row.endorsementCount ?? null,
    entityUrn: row.entityUrn || null,
  }));

  const certifications = (byType.get('Certification') || []).map((row) => ({
    name: textValue(row.name) || textValue(row.title),
    authority: textValue(row.authority) || textValue(row.companyName),
    licenseNumber: textValue(row.licenseNumber),
    url: textValue(row.url),
    dateRange: parseDateRange(row.dateRange || row.timePeriod),
    entityUrn: row.entityUrn || null,
  }));

  const languages = (byType.get('Language') || []).map((row) => ({
    name: textValue(row.name) || textValue(row.language),
    proficiency: textValue(row.proficiency),
    entityUrn: row.entityUrn || null,
  }));

  const projects = (byType.get('Project') || []).map((row) => ({
    title: textValue(row.title) || textValue(row.name),
    description: textValue(row.description),
    url: textValue(row.url),
    dateRange: parseDateRange(row.dateRange || row.timePeriod),
    entityUrn: row.entityUrn || null,
  }));

  const volunteering = (byType.get('VolunteerExperience') || []).map((row) => ({
    role: textValue(row.role) || textValue(row.title),
    organization: textValue(row.companyName) || textValue(row.organization),
    cause: textValue(row.cause),
    description: textValue(row.description),
    dateRange: parseDateRange(row.dateRange || row.timePeriod),
    entityUrn: row.entityUrn || null,
  }));

  const publications = (byType.get('Publication') || []).map((row) => ({
    title: textValue(row.title) || textValue(row.name),
    publisher: textValue(row.publisher),
    description: textValue(row.description),
    url: textValue(row.url),
    date: textValue(row.publishedOn),
    entityUrn: row.entityUrn || null,
  }));

  const patents = (byType.get('Patent') || []).map((row) => ({
    title: textValue(row.title) || textValue(row.name),
    patentNumber: textValue(row.patentNumber),
    description: textValue(row.description),
    url: textValue(row.url),
    date: textValue(row.issueDate),
    entityUrn: row.entityUrn || null,
  }));

  const courses = (byType.get('Course') || []).map((row) => ({
    name: textValue(row.name) || textValue(row.title),
    number: textValue(row.number),
    entityUrn: row.entityUrn || null,
  }));

  const honors = (byType.get('Honor') || []).map((row) => ({
    title: textValue(row.title) || textValue(row.name),
    issuer: textValue(row.issuer),
    description: textValue(row.description),
    date: textValue(row.issuedOn),
    entityUrn: row.entityUrn || null,
  }));

  const organizations = (byType.get('Organization') || []).map((row) => ({
    name: textValue(row.name),
    position: textValue(row.position),
    dateRange: parseDateRange(row.dateRange || row.timePeriod),
    entityUrn: row.entityUrn || null,
  }));

  const recommendations = {
    received: (byType.get('Recommendation') || byType.get('RecommendationReceived') || [])
      .filter((row) => row.recommendationText || row.text)
      .map((row) => ({
        text: textValue(row.recommendationText) || textValue(row.text),
        recommender: textValue(row.recommender?.name) || textValue(row.recommender),
        relationship: textValue(row.relationship),
        entityUrn: row.entityUrn || null,
      })),
    given: (byType.get('RecommendationGiven') || []).map((row) => ({
      text: textValue(row.recommendationText) || textValue(row.text),
      recipient: textValue(row.recommendee?.name) || textValue(row.recommendee),
      relationship: textValue(row.relationship),
      entityUrn: row.entityUrn || null,
    })),
  };

  return {
    identity,
    stats,
    contact,
    experience,
    education,
    skills,
    certifications,
    languages,
    projects,
    volunteering,
    publications,
    patents,
    courses,
    honors,
    organizations,
    recommendations,
  };
}

module.exports = {
  textValue,
  collectObjects,
  indexEntities,
  resolveRef,
  parseDateRange,
  parseProfileEntities,
};

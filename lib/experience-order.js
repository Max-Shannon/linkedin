function isFilled(value) {
  return value != null && value !== '';
}

function mergeDateRange(base, incoming) {
  const out = { ...(base || {}), ...(incoming || {}) };
  if (!out.text && incoming?.text) {
    out.text = incoming.text;
  }
  if (!out.start && incoming?.start) {
    out.start = incoming.start;
  }
  if (!out.end && incoming?.end) {
    out.end = incoming.end;
  }
  if (!out.sortStart && incoming?.sortStart) {
    out.sortStart = incoming.sortStart;
  }
  if (!out.sortEnd && incoming?.sortEnd) {
    out.sortEnd = incoming.sortEnd;
  }
  if (out.isCurrent == null && incoming?.isCurrent != null) {
    out.isCurrent = incoming.isCurrent;
  }
  return out;
}

function mergeExperienceEntry(base, incoming) {
  if (!base) {
    return { ...incoming };
  }

  const out = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null || value === '') {
      continue;
    }
    if (key === 'dateRange') {
      out.dateRange = mergeDateRange(base.dateRange, incoming.dateRange);
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      out[key] = { ...(base[key] || {}), ...value };
      continue;
    }
    if (!isFilled(out[key])) {
      out[key] = value;
    }
  }
  return out;
}

function experienceMatchKey(row) {
  if (row.entityUrn) {
    return `urn:${row.entityUrn}`;
  }
  return `${row.title || ''}|${row.companyName || ''}|${row.dateRange?.text || ''}`.toLowerCase();
}

function mergeExperienceLists(existing, incoming) {
  if (!incoming?.length) {
    return existing || [];
  }
  if (!existing?.length) {
    return [...incoming];
  }

  const existingByUrn = new Map();
  const existingByKey = new Map();
  for (const row of existing) {
    if (row.entityUrn) {
      existingByUrn.set(row.entityUrn, row);
    }
    existingByKey.set(experienceMatchKey(row), row);
  }

  const merged = [];
  const usedUrns = new Set();
  const usedKeys = new Set();

  for (const row of incoming) {
    const prior =
      (row.entityUrn && existingByUrn.get(row.entityUrn)) ||
      existingByKey.get(experienceMatchKey(row)) ||
      null;
    const combined = mergeExperienceEntry(prior, row);
    merged.push(combined);
    if (combined.entityUrn) {
      usedUrns.add(combined.entityUrn);
    }
    usedKeys.add(experienceMatchKey(combined));
  }

  for (const row of existing) {
    if (row.entityUrn && usedUrns.has(row.entityUrn)) {
      continue;
    }
    const key = experienceMatchKey(row);
    if (usedKeys.has(key)) {
      continue;
    }
    if (!row.entityUrn && !row.dateRange?.text && !row.dateRange?.sortStart) {
      continue;
    }
    merged.push(row);
    usedKeys.add(key);
  }

  return merged;
}

function finalizeExperience(experience) {
  if (!Array.isArray(experience) || experience.length === 0) {
    return experience;
  }

  const seen = new Set();
  const deduped = [];
  for (const row of experience) {
    const key = row.entityUrn || experienceMatchKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

module.exports = {
  mergeExperienceEntry,
  mergeExperienceLists,
  finalizeExperience,
};

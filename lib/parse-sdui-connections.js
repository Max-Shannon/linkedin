function unescapeRscString(value) {
  if (!value) {
    return '';
  }
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function uniqueInOrder(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function collapsePairedDuplicates(values, expectedCount) {
  if (
    expectedCount > 0 &&
    values.length === expectedCount * 2 &&
    values.every((value, index, arr) => index % 2 === 1 || value === arr[index + 1])
  ) {
    return values.filter((_, index) => index % 2 === 0);
  }
  if (expectedCount > 0 && values.length === expectedCount) {
    return values;
  }
  return values;
}

function extractNameFromChunk(chunk) {
  const nameMatch = chunk.match(
    /"viewName":"connections-profile"[\s\S]*?"children":\["((?:[^"\\]|\\.)*)"\]/
  );
  const name = nameMatch ? unescapeRscString(nameMatch[1]) : '';
  if (!name || name.startsWith('Connected on ')) {
    return '';
  }
  return name;
}

function extractHeadlineFromChunk(chunk) {
  const profileSection = chunk.match(
    /"viewName":"connections-profile"[\s\S]*?(?="viewName":"message-button"|"viewName":"connections-remove-connection-dropdown")/
  );
  const section = profileSection ? profileSection[0] : chunk;
  const stringHeadline = section.match(
    /"textProps":\{[\s\S]*?"children":\["((?:[^"\\]|\\.)*)"\][\s\S]*?"linkColorTokens"/
  );
  if (stringHeadline) {
    const headline = unescapeRscString(stringHeadline[1]);
    if (headline && !headline.startsWith('Connected on ')) {
      return headline;
    }
  }

  const textPropsMatch = section.match(
    /"textProps":\{[\s\S]*?"children":(\[[\s\S]*?\]),"linkColorTokens"/
  );
  if (!textPropsMatch) {
    return '';
  }

  const parts = [];
  for (const match of textPropsMatch[1].matchAll(/"children":\["((?:[^"\\]|\\.)*)"\]/g)) {
    const text = unescapeRscString(match[1]).trim();
    if (text && !text.startsWith('Connected on')) {
      parts.push(text);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseLegacyConnectionsList(text) {
  const byVanity = new Map();
  const chunks = text.split('"viewName":"connections-list"');

  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const urlMatch = chunk.match(
      /linkedin\.com(?:\\\/|\/)in(?:\\\/|\/)([a-zA-Z0-9._%-]+)/i
    );
    if (!urlMatch) {
      continue;
    }

    const vanityName = urlMatch[1];
    if (byVanity.has(vanityName)) {
      continue;
    }

    const name = extractNameFromChunk(chunk);
    const connectedMatch = chunk.match(
      /"children":\["Connected on ((?:[^"\\]|\\.)*)"\]/
    );

    byVanity.set(vanityName, {
      name,
      title: extractHeadlineFromChunk(chunk),
      profileUrl: `https://www.linkedin.com/in/${vanityName}/`,
      vanityName,
      connectedOn: connectedMatch ? unescapeRscString(connectedMatch[1]) : '',
    });
  }

  return [...byVanity.values()];
}

function parseRscConnectionCards(text) {
  const vanities = uniqueInOrder(
    [...text.matchAll(/ConnectionCard_\d+-([\p{L}\p{N}._%-]+)/gu)].map((match) => match[1])
  );
  if (vanities.length === 0) {
    return [];
  }

  const rawNames = [...text.matchAll(
    /"id":"profile_name_loading_state"[\s\S]{0,180}?"stringValue":"((?:[^"\\]|\\.)*)"/g
  )].map((match) => unescapeRscString(match[1]));
  const rawTitles = [...text.matchAll(
    /"id":"profile_headline_loading_state"[\s\S]{0,180}?"stringValue":"((?:[^"\\]|\\.)*)"/g
  )].map((match) => unescapeRscString(match[1]));
  const dates = [...text.matchAll(
    /"children":\["Connected on ((?:[^"\\]|\\.)*)"\]/g
  )].map((match) => unescapeRscString(match[1]));

  const names = collapsePairedDuplicates(rawNames, vanities.length);
  const titles = collapsePairedDuplicates(rawTitles, vanities.length);

  return vanities.map((vanityName, index) => ({
    name: names[index] || '',
    title: titles[index] || '',
    profileUrl: `https://www.linkedin.com/in/${vanityName}/`,
    vanityName,
    connectedOn: dates[index] || '',
  }));
}

function parseConnectionsFromSduiResponse(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const fromCards = parseRscConnectionCards(text);
  if (fromCards.length > 0) {
    return fromCards;
  }

  return parseLegacyConnectionsList(text);
}

module.exports = {
  parseConnectionsFromSduiResponse,
  unescapeRscString,
};

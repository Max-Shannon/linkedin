function unescapeRscString(value) {
  if (!value) {
    return '';
  }
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function extractNameFromChunk(chunk) {
  const nameMatch = chunk.match(
    /"viewName":"connections-profile"[\s\S]*?"children":\["((?:[^"\\]|\\.)*)"\]/
  );
  return nameMatch ? unescapeRscString(nameMatch[1]) : '';
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
    return unescapeRscString(stringHeadline[1]);
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

function parseConnectionsFromSduiResponse(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

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

module.exports = {
  parseConnectionsFromSduiResponse,
  unescapeRscString,
};

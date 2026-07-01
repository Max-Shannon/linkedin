const fs = require('fs');

function parseCsvRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current);
  return fields;
}

function loadConnectionsCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length <= 1) {
    return [];
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [name, title, profileUrl, vanityName, connectedOn] = parseCsvRow(lines[i]);
    if (!vanityName && !profileUrl) {
      continue;
    }
    rows.push({
      name: name || '',
      title: title || '',
      profileUrl: profileUrl || '',
      vanityName: vanityName || '',
      connectedOn: connectedOn || '',
    });
  }
  return rows;
}

module.exports = {
  parseCsvRow,
  loadConnectionsCsv,
};

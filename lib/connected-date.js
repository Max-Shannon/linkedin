const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function parseConnectedDate(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = MONTHS[match[1].toLowerCase()];
  if (month == null) {
    return null;
  }
  return new Date(Number(match[3]), month, Number(match[2]));
}

function monthsCutoffDate(months, now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

function formatCutoffLabel(cutoff) {
  return cutoff.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isWithinMonthsWindow(row, cutoff) {
  const date = parseConnectedDate(row.connectedOn);
  if (!date) {
    return true;
  }
  return date >= cutoff;
}

function filterConnectionsToMonthsWindow(rows, cutoff) {
  return rows.filter((row) => isWithinMonthsWindow(row, cutoff));
}

function batchIsPastMonthsWindow(batch, cutoff) {
  const dates = batch
    .map((row) => parseConnectedDate(row.connectedOn))
    .filter(Boolean);
  if (dates.length === 0) {
    return false;
  }
  return dates.every((date) => date < cutoff);
}

module.exports = {
  parseConnectedDate,
  monthsCutoffDate,
  formatCutoffLabel,
  isWithinMonthsWindow,
  filterConnectionsToMonthsWindow,
  batchIsPastMonthsWindow,
};

function createVisitLog() {
  const entries = [];

  return {
    record(type, url, extra = {}) {
      entries.push({
        at: new Date().toISOString(),
        type,
        url: String(url || ''),
        ...extra,
      });
    },
    recordPage(page, type, extra = {}) {
      this.record(type, page.url(), extra);
    },
    list() {
      return [...entries];
    },
    urls() {
      return entries.map((entry) => entry.url).filter(Boolean);
    },
  };
}

module.exports = {
  createVisitLog,
};

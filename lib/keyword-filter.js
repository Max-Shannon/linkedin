const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LENGTH = 100;

function normalizeKeywords(input) {
  const values = Array.isArray(input) ? input : [input];
  const keywords = [];
  const seen = new Set();

  for (const value of values) {
    for (const part of String(value || '').split(/[,\n]/)) {
      const keyword = part.trim().replace(/\s+/g, ' ');
      const key = keyword.toLocaleLowerCase();
      if (!keyword || seen.has(key)) {
        continue;
      }
      if (keyword.length > MAX_KEYWORD_LENGTH) {
        throw new Error(
          `Keyword "${keyword.slice(0, 30)}…" is too long (maximum ${MAX_KEYWORD_LENGTH} characters).`
        );
      }
      keywords.push(keyword);
      seen.add(key);
      if (keywords.length > MAX_KEYWORDS) {
        throw new Error(`Use no more than ${MAX_KEYWORDS} keywords.`);
      }
    }
  }

  return keywords;
}

function titleMatchesKeywords(title, keywords) {
  if (!keywords || keywords.length === 0) {
    return true;
  }
  const haystack = String(title || '').toLocaleLowerCase();
  return keywords.some((keyword) =>
    haystack.includes(String(keyword).toLocaleLowerCase())
  );
}

module.exports = {
  normalizeKeywords,
  titleMatchesKeywords,
};

const assert = require('assert');
const {
  normalizeKeywords,
  titleMatchesKeywords,
} = require('../lib/keyword-filter');

assert.deepStrictEqual(
  normalizeKeywords(' recruiter, Sales Director\nbusiness   development,RECRUITER '),
  ['recruiter', 'Sales Director', 'business development']
);
assert.strictEqual(
  titleMatchesKeywords('Senior Technical Recruiter', ['recruiter', 'sales']),
  true
);
assert.strictEqual(
  titleMatchesKeywords('VP of Business Development', ['business development']),
  true
);
assert.strictEqual(
  titleMatchesKeywords('Software Engineer', ['recruiter', 'sales']),
  false
);
assert.strictEqual(titleMatchesKeywords('', []), true);

assert.throws(
  () => normalizeKeywords('x'.repeat(101)),
  /too long/
);

console.log('keyword-filter tests passed');

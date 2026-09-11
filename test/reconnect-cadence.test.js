const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  CADENCE,
  firstNameOf,
  renderTemplate,
  buildCadence,
  buildCampaign,
} = require('../lib/reconnect-cadence');

const contact = {
  name: 'Ada Placeholder',
  title: 'Head of Synergy',
  company: 'Fictional Holdings Ltd',
};

assert.strictEqual(firstNameOf(contact), 'Ada');
assert.strictEqual(firstNameOf({ firstName: 'Ada', name: 'Ada Lovelace' }), 'Ada');
assert.strictEqual(firstNameOf({}), 'there');

assert.strictEqual(
  renderTemplate('Hi {{firstName}} at {{company}}', contact),
  'Hi Ada at Fictional Holdings Ltd'
);
assert.strictEqual(
  renderTemplate('Hi {{firstName}}', { name: '' }),
  'Hi there'
);
assert.strictEqual(
  renderTemplate('{{company}}', {}),
  'your organisation'
);
assert.strictEqual(
  renderTemplate('{{unknownKey}}', contact),
  '{{unknownKey}}'
);

const cadence = buildCadence(contact);
assert.strictEqual(cadence.length, CADENCE.length);
assert.strictEqual(cadence[0].step, 1);
assert.strictEqual(cadence[0].day, 0);
assert.ok(cadence[0].body.includes('Ada'));
assert.ok(cadence[0].body.includes('Fictional Holdings Ltd'));
assert.ok(!cadence.some((message) => message.body.includes('{{')));

// The breakup is followed by a message, which is the entire joke.
const breakup = cadence.find((message) => message.step === 4);
const resurrection = cadence.find((message) => message.step === 5);
assert.ok(breakup.day < resurrection.day);
assert.ok(/stop/i.test(breakup.body));

// The campaign is ordered by day so the preview reads chronologically.
const campaign = buildCampaign([contact, { name: 'Brendan Notareal' }]);
assert.strictEqual(campaign.length, CADENCE.length * 2);
for (let i = 1; i < campaign.length; i += 1) {
  assert.ok(campaign[i].day >= campaign[i - 1].day);
}

// The shipped fixture is loadable and contains only invented contacts.
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'reconnect-connections.json'),
    'utf8'
  )
);
assert.ok(Array.isArray(fixture));
assert.ok(fixture.length > 0);
const INVENTED_COMPANIES = new Set([
  'Fictional Holdings Ltd',
  'Nonexistent Systems',
  'Imaginary Dynamics',
]);
assert.ok(fixture.every((entry) => INVENTED_COMPANIES.has(entry.company)));

// The cadence engine must never grow a transport layer.
const source = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'reconnect-cadence.js'),
  'utf8'
);
assert.ok(!/require\(/.test(source), 'cadence engine must have no dependencies');
assert.ok(!/axios|puppeteer|fetch|https?:\/\//.test(source), 'cadence engine must have no transport');

const cli = fs.readFileSync(path.join(__dirname, '..', 'reconnect.js'), 'utf8');
assert.ok(!/linkedin-auth|voyager-client|axios|puppeteer/.test(cli), 'reconnect CLI must not import a LinkedIn client');

console.log('reconnect-cadence tests passed');

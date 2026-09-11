const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  CADENCE,
  firstNameOf,
  renderTemplate,
  buildCadence,
  buildCampaign,
  buildMetrics,
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
assert.strictEqual(renderTemplate('Hi {{firstName}}', { name: '' }), 'Hi there');
assert.strictEqual(renderTemplate('{{company}}', {}), 'your organisation');
assert.strictEqual(renderTemplate('{{unknownKey}}', contact), '{{unknownKey}}');

const cadence = buildCadence(contact);
assert.strictEqual(cadence.length, CADENCE.length);
assert.strictEqual(cadence[0].step, 1);
assert.strictEqual(cadence[0].day, 0);
assert.ok(cadence[0].body.includes('Ada'));
assert.ok(cadence[0].body.includes('Fictional Holdings Ltd'));

// The cadence is daily: one touch per day, no gaps, starting at day 0.
CADENCE.forEach((step, index) => {
  assert.strictEqual(step.day, index, `step ${step.step} must land on day ${index}`);
  assert.strictEqual(step.step, index + 1);
});

// Every message carries a meme, and the meme is part of the rendered body.
for (const message of cadence) {
  assert.ok(message.meme && message.meme.trim().length > 0, `step ${message.step} needs a meme`);
  assert.ok(message.body.includes(message.meme), `step ${message.step} must render its meme`);
}

// Merge fields resolve everywhere except the one place the joke needs them not to.
const unresolved = cadence.filter((message) => message.body.includes('{{'));
assert.strictEqual(unresolved.length, 1, 'only the broken-merge-field step may show {{');
assert.strictEqual(unresolved[0].name, 'The Personal Touch');

// The breakup is followed the next day by a message, which is the entire joke.
const breakup = cadence.find((m) => m.name === 'The Breakup That Does Not Break Up');
const resurrection = cadence.find((m) => m.name === 'The Resurrection');
assert.strictEqual(resurrection.day, breakup.day + 1);
assert.ok(/stop/i.test(breakup.body));

// The loop closes: the last step repeats the first, copy and meme alike.
const first = cadence[0];
const last = cadence[cadence.length - 1];
assert.strictEqual(last.subject, first.subject);
assert.ok(last.meme.includes(first.meme.split('\n')[0]));

// The campaign is ordered by day so the preview reads chronologically.
const campaign = buildCampaign([contact, { name: 'Brendan Notareal' }]);
assert.strictEqual(campaign.length, CADENCE.length * 2);
for (let i = 1; i < campaign.length; i += 1) {
  assert.ok(campaign[i].day >= campaign[i - 1].day);
}

// The meme funnel counts what was rendered and zeroes everything downstream.
const metrics = buildMetrics(campaign);
const byLabel = new Map(metrics.map((m) => [m.label, m.value]));
assert.strictEqual(byLabel.get('Memes rendered'), String(campaign.length));
assert.strictEqual(byLabel.get('Memes delivered'), '0');
assert.strictEqual(byLabel.get('Memes converted'), '0');
assert.strictEqual(byLabel.get('Meme conversion rate'), '0.00%');
assert.strictEqual(byLabel.get('Relationships damaged'), '0');
for (const metric of metrics.slice(1, -1)) {
  assert.ok(/^(0|0\.00|0\.00%|NaN)/.test(metric.value), `${metric.label} must be zero`);
}

// The shipped fixture is loadable and contains only invented contacts.
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'reconnect-connections.json'), 'utf8')
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
assert.ok(
  !/axios|puppeteer|fetch|https?:\/\//.test(source),
  'cadence engine must have no transport'
);

const cli = fs.readFileSync(path.join(__dirname, '..', 'reconnect.js'), 'utf8');
assert.ok(
  !/linkedin-auth|voyager-client|axios|puppeteer/.test(cli),
  'reconnect CLI must not import a LinkedIn client'
);

console.log('reconnect-cadence tests passed');

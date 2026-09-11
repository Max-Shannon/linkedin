#!/usr/bin/env node
/**
 * ReConnect™ — the logical conclusion of remove-connections.js.
 *
 * `npm run connections:remove` deletes the people who spam you. This does the
 * opposite: it enrols them in a seven-touch sales cadence and prints, in full,
 * every message it would send.
 *
 * It would send them. It does not send them.
 *
 * This file reads a JSON fixture of invented contacts and writes to stdout.
 * It imports no auth module, opens no browser, and makes no network call —
 * `require` the transport yourself if you want to find out what that costs you.
 *
 * Usage:
 *   node reconnect.js
 *   node reconnect.js --contacts ./my-fixture.json
 *   node reconnect.js --step 4
 */

const fs = require('fs');
const path = require('path');

const { CADENCE, buildCampaign } = require('./lib/reconnect-cadence');

const DEFAULT_CONTACTS = path.join(
  __dirname,
  'test',
  'fixtures',
  'reconnect-connections.json'
);

function parseArgs(argv) {
  const options = { contacts: DEFAULT_CONTACTS, step: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--contacts') {
      options.contacts = argv[i + 1];
      i += 1;
    } else if (arg === '--step') {
      options.step = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

function loadContacts(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Contacts file not found: ${resolved}`);
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('Contacts file must contain a JSON array.');
  }
  return parsed;
}

function printMessage(message) {
  console.log('─'.repeat(78));
  console.log(
    `DAY ${String(message.day).padStart(2, ' ')}  ·  STEP ${message.step}/${CADENCE.length}  ·  ${message.name}`
  );
  console.log(`To:      ${message.to}`);
  console.log(`Subject: ${message.subject}`);
  console.log('');
  console.log(message.body);
  console.log('');
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log('Usage: node reconnect.js [--contacts <file.json>] [--step <n>]');
    console.log('');
    console.log('Prints the ReConnect™ cadence. Sends nothing. Ever.');
    return;
  }

  const contacts = loadContacts(options.contacts);
  const steps = options.step
    ? CADENCE.filter((step) => step.step === options.step)
    : CADENCE;

  if (steps.length === 0) {
    throw new Error(`No such cadence step: ${options.step}`);
  }

  const messages = buildCampaign(contacts, { steps });

  console.log('');
  console.log('  ReConnect™ — Re-engagement Cadence Preview');
  console.log(
    `  ${contacts.length} contacts · ${steps.length} touches · ${messages.length} messages`
  );
  console.log('');

  messages.forEach(printMessage);

  console.log('─'.repeat(78));
  console.log('');
  console.log(`  ${messages.length} messages rendered.`);
  console.log('  0 messages sent.');
  console.log('');
  console.log('  ReConnect™ has no transport layer and never will. The contacts');
  console.log('  above are invented. This is a joke about sales cadences, and a');
  console.log('  joke is all it is equipped to be.');
  console.log('');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`reconnect: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, loadContacts };

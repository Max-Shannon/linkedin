/**
 * ReConnect™ cadence engine.
 *
 * This module renders a sales cadence to plain text. It does not send
 * anything. There is deliberately no transport in this file: no network
 * client, no auth, no LinkedIn endpoint, no `send()`. It turns a list of
 * contacts into a list of strings, and that is the whole of it.
 *
 * See docs/RECONNECT.md for why.
 */

const CADENCE = [
  {
    step: 1,
    day: 0,
    name: 'The Connect',
    subject: 'Quick one, {{firstName}}',
    body: [
      'Hi {{firstName}},',
      '',
      'Saw you were {{title}} at {{company}} and thought I would reach out — I help',
      'companies like {{company}} unlock the value already sitting inside their',
      'organisation. Are you the right person to speak to about this?',
    ],
  },
  {
    step: 2,
    day: 2,
    name: 'The Value Add',
    subject: 'Thought of you when I read this',
    body: [
      'Hi {{firstName}},',
      '',
      'Sharing a piece I thought would resonate given your work at {{company}}.',
      '',
      '  "{{title}}s Are Leaving Value On The Table (And What To Do About It)"',
      '',
      'No agenda — just thought it was relevant. Happy to talk it through.',
    ],
  },
  {
    step: 3,
    day: 5,
    name: 'The Gentle Nudge',
    subject: 'Re: Quick one, {{firstName}}',
    body: [
      'Hi {{firstName}},',
      '',
      'Floating this back to the top of your inbox in case it got buried.',
      '',
      'Does Thursday work?',
    ],
  },
  {
    step: 4,
    day: 9,
    name: 'The Breakup That Does Not Break Up',
    subject: 'Closing the loop',
    body: [
      'Hi {{firstName}},',
      '',
      'I have not heard back so I will assume the timing is not right and stop',
      'reaching out. Wishing you and everyone at {{company}} the very best.',
      '',
      'All the best,',
    ],
  },
  {
    step: 5,
    day: 10,
    name: 'The Resurrection',
    subject: 'One last thing (sorry!)',
    body: [
      'Hi {{firstName}},',
      '',
      'I know I said I would stop reaching out. Something came across my desk this',
      'morning that was so relevant to {{company}} that I had to break my own rule.',
      '',
      'Do you have 15 minutes this week?',
    ],
  },
  {
    step: 6,
    day: 14,
    name: 'The Referral That Does Not Exist',
    subject: 'Wrong person?',
    body: [
      'Hi {{firstName}},',
      '',
      'If this is not your area, would you mind pointing me to whoever owns it at',
      '{{company}}? Happy to take it off your plate entirely.',
      '',
      '(If it is your area — Thursday?)',
    ],
  },
  {
    step: 7,
    day: 21,
    name: 'The Loop',
    subject: 'Quick one, {{firstName}}',
    body: [
      'Hi {{firstName}},',
      '',
      'Saw you were {{title}} at {{company}} and thought I would reach out — I help',
      'companies like {{company}} unlock the value already sitting inside their',
      'organisation. Are you the right person to speak to about this?',
      '',
      '[cadence complete — re-enrolling contact at step 1]',
    ],
  },
];

function firstNameOf(contact) {
  const explicit = String(contact.firstName || '').trim();
  if (explicit) {
    return explicit;
  }
  const full = String(contact.name || '').trim();
  return full.split(/\s+/)[0] || 'there';
}

function renderTemplate(template, contact) {
  const values = {
    firstName: firstNameOf(contact),
    name: String(contact.name || '').trim() || 'there',
    title: String(contact.title || '').trim() || 'a professional',
    company: String(contact.company || '').trim() || 'your organisation',
  };
  return String(template).replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

/**
 * Build every message the cadence would produce for one contact.
 * Returns plain objects. Nothing is sent, queued, or persisted.
 */
function buildCadence(contact, options = {}) {
  const steps = options.steps || CADENCE;
  return steps.map((step) => ({
    step: step.step,
    day: step.day,
    name: step.name,
    to: String(contact.name || '').trim() || 'Unknown Contact',
    subject: renderTemplate(step.subject, contact),
    body: step.body.map((line) => renderTemplate(line, contact)).join('\n'),
  }));
}

/** Build the cadence for a list of contacts, flattened and ordered by day. */
function buildCampaign(contacts, options = {}) {
  const messages = [];
  for (const contact of contacts) {
    messages.push(...buildCadence(contact, options));
  }
  return messages.sort((a, b) => a.day - b.day || a.to.localeCompare(b.to));
}

module.exports = {
  CADENCE,
  firstNameOf,
  renderTemplate,
  buildCadence,
  buildCampaign,
};

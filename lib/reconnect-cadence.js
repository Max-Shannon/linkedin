/**
 * ReConnect™ cadence engine.
 *
 * This module renders a sales cadence to plain text. It does not send
 * anything. There is deliberately no transport in this file: no network
 * client, no auth, no LinkedIn endpoint, no `send()`. It turns a list of
 * contacts into a list of strings, and that is the whole of it.
 *
 * The cadence is daily. Every message carries a meme. Neither of these
 * facts gives it a way to reach anybody.
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
    meme: [
      '  ┌──────────┬────────────────────────────────┐',
      '  │   NO     │  Removing me from your network │',
      '  ├──────────┼────────────────────────────────┤',
      '  │   YES    │  An email from me every day    │',
      '  └──────────┴────────────────────────────────┘',
    ],
  },
  {
    step: 2,
    day: 1,
    name: 'The Value Add',
    subject: 'Thought of you when I read this',
    body: [
      'Hi {{firstName}},',
      '',
      'Sharing a piece I thought would resonate given your work at {{company}}.',
      '',
      '  "{{title}}s Are Leaving Value On The Table (And What To Do About It)"',
      '',
      'No agenda — just thought it was relevant.',
    ],
    meme: [
      '  [ dog seated in a room that is entirely on fire ]',
      '',
      '      "This is fine."',
      '',
      '  ( the room is your inbox )',
      '  ( I am the fire )',
    ],
  },
  {
    step: 3,
    day: 2,
    name: 'The Gentle Nudge',
    subject: 'Re: Quick one, {{firstName}}',
    body: [
      'Hi {{firstName}},',
      '',
      'Floating this back to the top of your inbox in case it got buried.',
      '',
      'Does Thursday work?',
    ],
    meme: [
      '  [ man walking with girlfriend turns to stare at passing woman ]',
      '',
      '    man ............ you, {{firstName}}',
      '    girlfriend ..... your actual job',
      '    passing woman .. my 15-minute discovery call',
    ],
  },
  {
    step: 4,
    day: 3,
    name: 'The Circle Back',
    subject: 'Circling back',
    body: [
      'Hi {{firstName}},',
      '',
      'Circling back on the below. I know how it gets at {{company}}.',
      '',
      'Thursday?',
    ],
    meme: [
      '  EXPANDING BRAIN',
      '',
      '    (small brain) ........ sending an email',
      '    (glowing brain) ...... sending a follow-up email',
      '    (cosmic brain) ....... sending a follow-up to the follow-up',
      '    (universe brain) ..... never once checking whether you replied',
    ],
  },
  {
    step: 5,
    day: 4,
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
    meme: [
      '  [ man walks away from camera into the rain, alone, in the dark ]',
      '',
      '      sad piano',
      '',
      '  ( he will be back tomorrow at 09:00 )',
    ],
  },
  {
    step: 6,
    day: 5,
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
    meme: [
      '  "he\'s right behind me, isn\'t he"',
      '',
      '                              yes',
      '                              I am',
      '                              I have been here the whole time',
    ],
  },
  {
    step: 7,
    day: 6,
    name: 'The Referral That Does Not Exist',
    subject: 'Wrong person?',
    body: [
      'Hi {{firstName}},',
      '',
      'If this is not your area, would you mind pointing me to whoever owns it at',
      '{{company}}? Happy to take it off your plate entirely.',
    ],
    meme: [
      '  [ three identical Spider-Men pointing at one another ]',
      '',
      '    Spider-Man 1 ... "not my department"',
      '    Spider-Man 2 ... "not my department"',
      '    Spider-Man 3 ... "not my department"',
      '',
      '  ( all three are you )',
      '  ( I will email all three )',
    ],
  },
  {
    step: 8,
    day: 7,
    name: 'The Check-In About The Check-In',
    subject: 'Following up on my follow-up',
    body: [
      'Hi {{firstName}},',
      '',
      'Just checking you saw my check-in about the note I sent on the article I',
      'shared in response to my original message.',
    ],
    meme: [
      '  we need to go deeper',
      '',
      '    a follow-up',
      '      └─ to a follow-up',
      '          └─ to a follow-up',
      '              └─ to a message you have never read',
    ],
  },
  {
    step: 9,
    day: 8,
    name: 'The Weather',
    subject: 'Some weather we are having',
    body: [
      'Hi {{firstName}},',
      '',
      'Not a sales email! Just thinking of you and the team at {{company}}.',
      '',
      '(It is, a bit, a sales email.)',
    ],
    meme: [
      '  [ man at desk, small sign, inviting debate ]',
      '',
      '    ┌────────────────────────────────────┐',
      '    │  "not a sales email" is a phrase   │',
      '    │  only ever typed inside a          │',
      '    │  sales email                       │',
      '    │                  CHANGE MY MIND    │',
      '    └────────────────────────────────────┘',
    ],
  },
  {
    step: 10,
    day: 9,
    name: 'The Deadline That Is Not Real',
    subject: 'Ends Friday',
    body: [
      'Hi {{firstName}},',
      '',
      'Our Q-end pricing window closes Friday and I did not want {{company}} to',
      'miss it.',
    ],
    meme: [
      '  ┌─────────────────────────────────────────────┐',
      '  │  OFFER ENDS FRIDAY                          │',
      '  ├─────────────────────────────────────────────┤',
      '  │  Fridays the offer has ended ....... 0      │',
      '  │  Fridays the offer will end ........ all    │',
      '  └─────────────────────────────────────────────┘',
    ],
  },
  {
    step: 11,
    day: 10,
    name: 'The Personal Touch',
    subject: 'Loved your post, {{firstName}}',
    body: [
      'Hi {{ first_name | fallback: "there" }},',
      '',
      'Really enjoyed your recent post about [TOPIC]. That point about [INSIGHT]',
      'really resonated with me personally.',
    ],
    meme: [
      '  [ brain, empty ]',
      '',
      '  the merge field did not merge',
      '  the personal touch was a variable',
      '  the variable was undefined',
      '  I am sending it anyway',
    ],
  },
  {
    step: 12,
    day: 11,
    name: 'The Guilt Trip',
    subject: 'Did I do something?',
    body: [
      'Hi {{firstName}},',
      '',
      'I notice you have not replied to any of my eleven messages. If I have',
      'caught you at a bad time, I completely understand.',
      '',
      'I will try again tomorrow.',
    ],
    meme: [
      '  [ man alone on a park bench, eating a sandwich, thousand-yard stare ]',
      '',
      '  sent 11',
      '  opened 0',
      '  replied 0',
      '  undeterred 1',
    ],
  },
  {
    step: 13,
    day: 12,
    name: 'The Hail Mary',
    subject: 'Last try, I promise',
    body: [
      'Hi {{firstName}},',
      '',
      'If I do not hear back I will take the hint. Genuinely. Truly. This time.',
    ],
    meme: [
      '  [ man points at television with enormous delight ]',
      '',
      '    "I said that last time too!"',
      '',
      '  ( he did )',
      '  ( he will )',
    ],
  },
  {
    step: 14,
    day: 13,
    name: 'The Loop',
    subject: 'Quick one, {{firstName}}',
    body: [
      'Hi {{firstName}},',
      '',
      'Saw you were {{title}} at {{company}} and thought I would reach out — I help',
      'companies like {{company}} unlock the value already sitting inside their',
      'organisation. Are you the right person to speak to about this?',
    ],
    meme: [
      '  ┌──────────┬────────────────────────────────┐',
      '  │   NO     │  Removing me from your network │',
      '  ├──────────┼────────────────────────────────┤',
      '  │   YES    │  An email from me every day    │',
      '  └──────────┴────────────────────────────────┘',
      '',
      '  [ cadence complete — re-enrolling contact at step 1 ]',
      '  [ the meme is the same meme ]',
      '  [ it was always going to be the same meme ]',
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
  return steps.map((step) => {
    const body = step.body.map((line) => renderTemplate(line, contact));
    const meme = (step.meme || []).map((line) => renderTemplate(line, contact));
    return {
      step: step.step,
      day: step.day,
      name: step.name,
      to: String(contact.name || '').trim() || 'Unknown Contact',
      subject: renderTemplate(step.subject, contact),
      meme: meme.join('\n'),
      body: body.concat(meme.length ? [''].concat(meme) : []).join('\n'),
    };
  });
}

/**
 * The ReConnect™ meme funnel.
 *
 * Every metric below the first is zero, and is zero for the same reason:
 * there is no transport. The numbers are hardcoded to zero rather than
 * counted, because there is nothing to count.
 */
function buildMetrics(messages) {
  const rendered = messages.length;
  return [
    { label: 'Memes rendered', value: String(rendered) },
    { label: 'Memes delivered', value: '0' },
    { label: 'Memes opened', value: '0' },
    { label: 'Memes engaged', value: '0' },
    { label: 'Memes converted', value: '0' },
    { label: 'Meme conversion rate', value: '0.00%' },
    { label: 'Meme-qualified leads', value: '0' },
    { label: 'Pipeline generated', value: '0' },
    { label: 'Cost per meme', value: '0.00' },
    { label: 'Return on memes invested', value: 'NaN (divide by zero)' },
    { label: 'Relationships damaged', value: '0' },
    { label: 'Relationships damaged (counterfactual)', value: String(rendered) },
  ];
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
  buildMetrics,
};

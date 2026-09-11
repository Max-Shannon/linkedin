# ReConnect™

> Your connections are an asset. Stop deleting them.

`remove-connections.js` identifies the people who spam you and removes them.
ReConnect™ identifies the same people and enrols them in a seven-touch
re-engagement cadence.

```
npm run reconnect
npm run reconnect -- --step 4
npm run reconnect -- --contacts ./my-contacts.json
```

## The cadence

| Day | Step | Name |
| --: | ---: | --- |
| 0 | 1 | The Connect |
| 2 | 2 | The Value Add |
| 5 | 3 | The Gentle Nudge |
| 9 | 4 | The Breakup That Does Not Break Up |
| 10 | 5 | The Resurrection |
| 14 | 6 | The Referral That Does Not Exist |
| 21 | 7 | The Loop |

Step 7 is identical to step 1. This is not a bug. A contact who completes the
cadence is re-enrolled at the top of the cadence, because a contact who has not
said yes has not yet said yes.

## What this actually does

It prints. That is the entire feature.

`reconnect.js` reads a JSON file of invented contacts and writes the rendered
messages to stdout. `lib/reconnect-cadence.js` turns contact objects into
strings and has no `require` statements at all.

There is no transport. No auth, no browser, no HTTP client, no message
endpoint, no `send()`, no queue, no scheduler, no retry. The cadence has
nowhere to go and no way to get there.

`test/reconnect-cadence.test.js` asserts this — it reads both source files and
fails if either grows a dependency on `axios`, `puppeteer`, `fetch`, a URL, or
the repo's LinkedIn client. If you add a transport layer, the test suite breaks,
which is the point.

## Why it is built this way

The joke is the cadence copy. The joke is "The Breakup That Does Not Break Up"
being followed, one day later, by "The Resurrection." The joke does not require
that a single message reach a single human being, and it is funnier if none
ever does.

Actually sending this would be unsolicited automated direct marketing: against
LinkedIn's terms, against GDPR where the recipients are in the EU, and a
genuinely unpleasant thing to do to fifty people who did not ask for it. So the
send button was never built, and the tests make sure nobody builds it later.

Read it, laugh, close the tab.

# ReConnect™

> Your connections are an asset. Stop deleting them. Start memeing them.

`remove-connections.js` identifies the people who spam you and removes them.
ReConnect™ identifies the same people and enrols them in a fourteen-day daily
re-engagement cadence in which every single message contains a meme.

```
npm run reconnect
npm run reconnect -- --step 5
npm run reconnect -- --contacts ./my-contacts.json
```

## The cadence

One touch per day. No gaps. No rest days.

| Day | Step | Name | Meme |
| --: | ---: | --- | --- |
| 0 | 1 | The Connect | Drake |
| 1 | 2 | The Value Add | This Is Fine |
| 2 | 3 | The Gentle Nudge | Distracted Boyfriend |
| 3 | 4 | The Circle Back | Expanding Brain |
| 4 | 5 | The Breakup That Does Not Break Up | Walking Away In The Rain |
| 5 | 6 | The Resurrection | He's Right Behind Me Isn't He |
| 6 | 7 | The Referral That Does Not Exist | Spider-Men Pointing |
| 7 | 8 | The Check-In About The Check-In | We Need To Go Deeper |
| 8 | 9 | The Weather | Change My Mind |
| 9 | 10 | The Deadline That Is Not Real | Offer Ends Friday |
| 10 | 11 | The Personal Touch | Merge Field Returns Undefined |
| 11 | 12 | The Guilt Trip | Sandwich On A Bench |
| 12 | 13 | The Hail Mary | Man Pointing At Television |
| 13 | 14 | The Loop | Drake (identical) |

Step 5 tells the contact you are going to stop emailing them. Step 6 arrives the
following morning. A test asserts that gap is exactly one day.

Step 14 is byte-identical to step 1, meme included, and re-enrols the contact at
the top, because a contact who has not said yes has not yet said yes.

Step 11's merge field is deliberately broken and renders as
`Hi {{ first_name | fallback: "there" }},`. A test asserts it is the only message
in the cadence permitted to leak a template.

## The meme funnel

Every run ends with the numbers:

```
    Memes rendered ............................ 42
    Memes delivered ........................... 0
    Memes opened .............................. 0
    Memes engaged ............................. 0
    Memes converted ........................... 0
    Meme conversion rate ...................... 0.00%
    Meme-qualified leads ...................... 0
    Pipeline generated ........................ 0
    Cost per meme ............................. 0.00
    Return on memes invested .................. NaN (divide by zero)
    Relationships damaged ..................... 0
    Relationships damaged (counterfactual) .... 42
```

Everything below the first line is zero, and is zero for the same reason.

## What this actually does

It prints. That is the entire feature.

`reconnect.js` reads a JSON file of invented contacts and writes the rendered
messages to stdout. `lib/reconnect-cadence.js` turns contact objects into
strings and has no `require` statements at all.

There is no transport. No auth, no browser, no HTTP client, no message
endpoint, no `send()`, no queue, no scheduler, no retry. "Daily" describes a
column in a table. Nothing happens daily. Nothing happens at all.

`test/reconnect-cadence.test.js` asserts this — it reads both source files and
fails if either grows a dependency on `axios`, `puppeteer`, `fetch`, a URL, or
the repo's LinkedIn client. If you add a transport layer, the test suite breaks,
which is the point.

## Why it is built this way

The joke is the cadence. The joke is telling someone you will stop emailing them
and then emailing them the next morning with a picture of a man walking into the
rain. The joke does not require that a single message reach a single human
being, and it is funnier if none ever does.

Actually sending this would be unsolicited automated direct marketing: against
LinkedIn's terms, against GDPR where the recipients are in the EU, and a
genuinely unpleasant thing to do to fifty people who did not ask for it — the
more so daily. So the send button was never built, and the tests make sure
nobody builds it later.

Read it, laugh, close the tab.

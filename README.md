# LinkedIn Connection Cleaner

A Node.js tool to scrape your 1st-degree LinkedIn connections, classify them by job title (sales, recruitment, or neither), and bulk-remove the ones you don't want.

---

## Features

- Scrapes 1st-degree connections via LinkedIn people search using a keyword × geography grid
- Classifies each connection as `sales`, `recruitment`, `sales_and_recruitment`, or `not_target`
- Exports results to CSV with name, title, profile URL, and status
- Resumes interrupted scrapes automatically — no data lost
- Bulk-removes connections by status, with dry-run mode before anything is deleted
- Tracks removed profiles so they're skipped on future runs
- Ignores connections at specified companies (e.g. colleagues)

---

## Requirements

- Node.js 18+
- A LinkedIn account

---

## Setup

```bash
git clone https://github.com/bhealy/linkedin.git
cd linkedin
npm install
cp .env.example .env
```

Edit `.env` and set your LinkedIn email:

```
LINKEDIN_EMAIL=you@example.com
```

---

## Usage

### 1. Scrape connections

```bash
npm run scrape:sales
```

Opens a browser window, logs in to LinkedIn, and works through a grid of keyword × geography searches. Results are written to `sales-connections.csv` after every page. Progress is saved to `scrape-state.json` so you can stop and resume at any time.

```bash
npm run scrape:status        # show grid progress summary
npm run scrape:sales:fresh   # reset scrape progress (keeps existing CSV rows)
```

### 2. Review the CSV

`sales-connections.csv` columns:

| Column | Description |
|---|---|
| `name` | Full name |
| `title` | LinkedIn headline |
| `profile_url` | LinkedIn profile URL |
| `status` | `sales` / `recruitment` / `sales_and_recruitment` / `not_target` |
| `search_id` | Which keyword × geo cell found them |
| `geo` | Geography label |

### 3. Remove connections

```bash
# Dry run — shows who would be removed, makes no changes
npm run connections:remove -- --status spam --limit 20

# Execute removals
npm run connections:remove -- --execute --status spam --limit 20
```

`--status spam` targets all of `sales`, `recruitment`, and `sales_and_recruitment` in one pass. You can also target individual statuses:

```bash
npm run connections:remove -- --execute --status not_target --limit 50
npm run connections:remove -- --execute --status sales --limit 50
npm run connections:remove -- --execute --status recruitment --limit 50
```

#### Options

| Flag | Description |
|---|---|
| `--execute` | Actually remove (omit for dry run) |
| `--status <value>` | Filter by status: `spam`, `sales`, `recruitment`, `sales_and_recruitment`, `not_target` |
| `--limit <n>` | Max connections to remove in this run |
| `--ignore-company <name>` | Skip connections whose title mentions this company (can repeat) |
| `--ignore-companies <a,b>` | Comma-separated list of companies to ignore |
| `--fresh` | Clear removal history and start fresh |
| `--csv <path>` | Use a different CSV file |

Default ignored companies: **Manna**, **Meili** (colleagues). Add more with `--ignore-company`.

---

## Files

| File | Purpose |
|---|---|
| `scrape-sales-connections.js` | Main scraper |
| `remove-connections.js` | Bulk removal script |
| `search-plan.json` | Keyword × geography grid config |
| `sales-connections.csv` | Scrape output (gitignored) |
| `scrape-state.json` | Scrape resume state (gitignored) |
| `remove-connections-state.json` | Tracks removed profiles (gitignored) |
| `.env` | Your credentials (gitignored — never committed) |

---

## Notes

- Uses Puppeteer with your local LinkedIn session — nothing is sent to any external service
- LinkedIn caps people search results at ~250 per query; the keyword × geography grid works around this
- Removals are spaced ~1.2 seconds apart to avoid rate limiting
- The scraper supports both old and new LinkedIn search result DOM layouts

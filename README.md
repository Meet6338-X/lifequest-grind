# LifeQuest

A gamified activity tracker, second brain and focus dashboard. One master timer for
everything (coding, LeetCode, work, study, fitness), quests, money, XP, streaks,
badge achievements and an evolving companion (plant / animal / dragon / robot) that
literally flies when it levels up far enough.

Everything is **free** and **local-first**: no accounts, no paid APIs, no build step.

## Repo layout

```text
lifequest-app/     Full local app (responsive, 5 views, all features)
  index.html       Single page app
  css/             themes.css (5 switchable themes) + app.css (Memphis system)
  js/              store, companion, music, integrations, market, archive, app
  assets/          8 anime/scenic 4K backgrounds (3840px+, downloaded via agent-reach)
results/           Standalone HTML/CSS/JS progress report (pure Memphis page)
scripts/           helper scripts (fetch backgrounds, verify, smoke test)
```

## Run it

Option A — Windows one-click:

```text
double-click start.bat     starts both servers, opens http://localhost:4173
double-click stop.bat      stops both servers (only touches ports 4173/4174)
```

`start.bat` is safe to run twice (it detects ports already in use), keeps server
windows minimized, and `start.bat noopen` skips opening the browser.

Option B — just open it:

```text
double-click lifequest-app\index.html
```

Option C — local server manually (recommended, YouTube player prefers it):

```powershell
npx.cmd --yes serve -l 4173 lifequest-app
# then open http://localhost:4173
```

Results page:

```powershell
npx.cmd --yes serve -l 4174 results
```

> PowerShell note: use `npx.cmd`, the `.ps1` shim is blocked by execution policy.
> The `.bat` files already do this for you.

## What is inside

| Area | Details |
|---|---|
| Master timer | Big centered clock, start / pause / resume / finish, live coin counter, manual start-end entry |
| Session details | Expanded form lives in a modal (Session details button), main screen stays clean and shareable |
| Coin market | Green/red candlestick chart from real session coins, live last candle, on dashboard and stats |
| Quests | Priorities, one-tap complete, coins per quest, daily bonus meter |
| LeetCode lab | Problem tracker, 8 statuses, difficulty filters, review queue, dual-profile live sync with combined totals |
| Rewards | Money (harder per-category rates), Money shop (boosters, streak freeze), XP, levels, streaks, 12 badges |
| Companion | 4 types x 5-7 evolution stages (one stage per 50 XP, evolves early), trains/eats/grows every second, fly animations, speech bubbles |
| Dashboard | Add or remove blocks (companion, stats, coin market, quests, sessions, rooms) from Settings |
| Study rooms | Friend list, room codes, shared coin goals, leaderboard via exported progress files, Google Meet links that attach to sessions |
| Themes | Memphis cream (default), dark glass, cyber, forest, light |
| Backgrounds | 9 options: none + 8 bundled 4K anime scenes, custom URL, adjustable veil, panel transparency slider |
| Layout | Drag any dashboard block to resize it, add/remove blocks, collapsible sidebar (edge-drag to reopen) |
| Music | YouTube video + playlist support via IFrame API (no key), volume, next |
| Stats | 7-day chart, category split, coins by category, coin market candles, badges, GitHub totals panel |
| Data | JSON in localStorage, export/import backup, demo data loader, reset |
| Daily files | Everyday JSON goes in a `lifequest-data/` folder created in your chosen directory (`lifequest-YYYY-MM-DD.json` + `lifequest-final.json`); folder is remembered, auto-saves daily, downloads as fallback |

## Free integrations (no API keys)

- **LeetCode** — `alfa-leetcode-api.onrender.com` (profile, solved counts, acceptance)
  Default usernames `shahmeet644` (238 solved: 87 Easy / 111 Medium / 40 Hard)
  + `BugSlayerMeet` (178 solved). Sync shows the combined total.
  Set your usernames in LeetCode view → Sync.
- **GitHub** — `api.github.com` (repo, star and follower totals; 60 req/h unauthenticated)
  Default user `Meet6338-X` (51 repos, 42 followers, 1 star).
  Set your username in Stats view → Fetch.
- **WakaTime** — optional: paste your own free API key, stored only in your browser.
- **Images** — 4K wallpapers fetched from wallhaven.cc (SFW) using agent-reach.

> Privacy: only aggregate numbers are shown (LeetCode counts, repo/follower/star
> totals). No repo names or project names appear anywhere in the app, demo data
> or results page.

## Keyboard shortcuts

- `S` start / pause the timer
- `F` finish and collect rewards
- `1`–`5` jump between views

## JSON data shape

Everything lives under the `lifequest_v2` key:

```json
{
  "version": 2,
  "profile": { "coins": 0, "xp": 0, "streak": { "current": 0, "best": 0, "lastDay": "" }, "badges": {} },
  "settings": { "theme": "memphis", "background": "none", "companion": "dragon", "rates": {} },
  "sessions": [{ "category": "Coding", "durationSec": 3600, "coins": 120, "xp": 96 }],
  "tasks": [{ "title": "Ship it", "done": false, "priority": "high" }],
  "leetcode": [{ "title": "Two Sum", "difficulty": "Easy", "status": "Accepted" }],
  "leetcodeLive": { "username": "you", "stats": { "solved": 0 } },
  "github": { "username": "you", "repos": [] }
}
```

The results page reads the same key, so it shows your real numbers automatically
when both pages run in the same origin (or import a JSON backup manually).

## Helper scripts

```powershell
powershell -ExecutionPolicy Bypass -File scripts\fetch-backgrounds.ps1   # re-download 4K backgrounds
node scripts\verify-ids.js        # check every getElementById target exists
node scripts\smoke-test.js        # app interaction tests (needs the server on :4173)
node scripts\smoke-results.js     # results page tests (needs the server on :4174)
```

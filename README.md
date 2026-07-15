# Dono Higher or Lower

An accessible, single-page Dono game built around the **QS World University Rankings 2027**. A player sees one university's rank and decides whether the next university is ranked higher (closer to `#1`) or lower (further from `#1`).

The project is deliberately dependency-free: the browser UI is vanilla HTML, CSS, and JavaScript, while the game rules are a small reusable module with Node-based tests.

## Highlights

- Four play formats: Sudden Death, Three Lives, Timed, and a shared Daily Challenge.
- Six ranking pools: Global, Top 500, Top 200, Top 50, UK Universities, and US Universities.
- Rank-gap difficulty controls for the Global pool.
- Keyboard controls, screen-reader announcements, focus management, and reduced-motion-aware confetti.
- Local personal bests, remembered settings, result history, and shareable result text.
- Deterministic daily runs that can be resumed on the same browser and replayed as practice after completion.

## Quick start

Serve the repository as a static site, then open the local address in a browser:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

Do not open `index.html` directly from the file system. The app loads its CSV with `fetch`, which browsers commonly block for `file://` pages.

No package installation or build step is required. Any static host that serves the application files and `data/` will work.

## Optional Daily leaderboard

The Daily Challenge leaderboard is optional and does not affect local gameplay. To enable it, edit `supabase-config.js` with your Supabase project URL and browser-safe publishable key. Do not use a database password, secret key, or service-role key in the browser. If configuration, authentication, or the network is unavailable, Daily completion remains saved locally and only the leaderboard component reports the issue.

## How to play

1. Read the visible university's rank. Smaller numbers are better: `#1` is the highest-ranked institution.
2. Decide whether the hidden university is ranked higher or lower.
3. Choose **Higher ranked** or **Lower ranked**. Its rank is revealed, then it becomes the known university for the next comparison.

Use `H` / <kbd>↑</kbd> for Higher and `L` / <kbd>↓</kbd> for Lower. On a revealed non-timed round, use <kbd>Enter</kbd> or <kbd>Space</kbd> to continue.

Equal ranks are never compared. The selector also avoids repeating an unordered pair until it has to recycle pair history, and favours universities not recently used.

## Game formats and scoring

| Format | Rules | Scoring |
| --- | --- | --- |
| Sudden Death | The first wrong answer ends the run. | +1 per correct answer. |
| Three Lives | Start with three lives; each wrong answer loses one. | Correct answers earn +1 at streaks 1–2, +2 at 3–4, +3 at 5–9, and +5 at 10+. |
| Timed | The 60-second clock starts with the first answer. Reveals advance automatically. | +1 correct; −1 incorrect, with the score never below zero. |
| Daily Challenge | One deterministic Global sequence per UTC day, with three lives. An official run may be resumed on the same browser; completed runs offer practice replays. | The same streak scoring as Three Lives. |

Personal bests are kept independently for each normal-game configuration: format, pool, and—when using Global—the selected difficulty.

## Pools and difficulty

| Pool | Eligibility |
| --- | --- |
| Global | Every parsed ranking record. |
| Top 500 / 200 / 50 | Game ordering value no greater than 500, 200, or 50. |
| UK Universities | Country normalised to `United Kingdom`. |
| US Universities | Country normalised to `United States of America`. |

Difficulty appears only for the Global pool and filters a comparison by the absolute gap between the two game ranks:

| Difficulty | Inclusive rank gap |
| --- | --- |
| Easy | 151–400 |
| Normal | 50–150 |
| Hard | 1–49 |

## Project layout

```text
.
├── index.html                         # Page, styling, UI rendering, browser behaviour
├── game-core.js                       # Data parsing, selection, scoring, Daily logic
├── data/
│   └── university-rankings-2027.csv   # QS 2027 rankings source used by the app
└── tests/
    └── game-core.test.js              # Dependency-free Node test suite
```

`game-core.js` is exposed as `window.DonoHOL` in the browser and as a CommonJS module in Node. Keeping the core separate means the ranking rules and persistence helpers can be exercised without a browser.

## Rankings data

At startup, `index.html` fetches `data/university-rankings-2027.csv` and passes it to `loadUniversities`.

The parser:

- handles quoted CSV fields and escaped quotes;
- finds the best header row within the first eight rows, so introductory spreadsheet rows are supported;
- recognises rank, institution/name, country/territory, and optional `Index` columns by heading rather than fixed position;
- normalises common UK and US country variants; and
- ignores duplicate exact-rank records with the same name and country.

Exact numerical ranks are used directly. Banded values such as `1201–1400` and `1401+` cannot be compared as exact published ranks. If the source provides an `Index`, the app uses that index as an ordering value so the record can remain in the game; otherwise the banded record is excluded from playable data. This is an ordering convenience, not a claim that the displayed index is an official precise rank.

### Updating the dataset

1. Replace `data/university-rankings-2027.csv` with the new export.
2. Keep columns that identify rank and institution name; retain `Index` if you want banded ranks included.
3. Update `DONO_CONFIG.datasetLabel` in `index.html`.
4. Update `DATASET_VERSION` in `game-core.js` (for example, `qs2028`). This intentionally changes the Daily seed and its local-storage namespace.
5. Run the tests and manually try the desired pools.

If the CSV cannot load or does not include usable rank and name columns, the application presents an error screen instead of starting a game.

## Daily Challenge details

The Daily Challenge uses Global data and a UTC date key in `YYYY-MM-DD` form. Its seed source is:

```text
dono-daily-v1-qs2027-YYYY-MM-DD
```

The core hashes that source, creates a seeded pseudo-random generator, applies a Fisher–Yates shuffle, and rearranges/removes adjacent equal-rank entries so every consecutive comparison is valid. Identical dataset version and date inputs generate the same sequence.

Official progress is saved after each answer under keys such as:

```text
dono_daily_state_v1_qs2027_2026-07-14
dono_daily_last_completed_v1_qs2027
```

This is a front-end-only convenience feature, not secure one-attempt enforcement. Clearing browser storage, changing device or browser, changing the clock, or altering client-side code can bypass it. Accounts, cross-device progress, leaderboards, and anti-cheat enforcement require a backend.

## Configuration and deployment

The brand configuration object sits at the top of `index.html` in `DONO_CONFIG`:

- `brandName`, `websiteUrl`, and `tagline`
- `logoUrl` to replace the text wordmark with an image
- end-of-game CTA copy and label
- `datasetLabel`

In the current renderer, `logoUrl` replaces the text wordmark and `tagline` populates the footer. The other values are retained as brand metadata for future CTA/dataset-label wiring; changing them alone does not currently alter visible gameplay copy.

The colour palette and typography tokens immediately below it are CSS custom properties. The page loads the DM Sans web font from Google Fonts; the gameplay itself has no external runtime dependency.

To deploy, publish the repository root as a static site and ensure `data/university-rankings-2027.csv` is served at the same relative path. Result links add `?mode=<format>` to preselect a format, including `?mode=daily`.

## Browser storage and sharing

The app uses `localStorage` for recent settings, normal-game personal bests, and Daily state. It continues to work when storage is unavailable, but without persistence. Normal result sharing and spoiler-free Daily sharing use the Web Share API when present, then the Clipboard API, with a legacy copy fallback.

## Tests

Run the full core test suite with Node:

```bash
node tests/game-core.test.js
```

The tests cover CSV parsing, country and pool handling, rank-gap boundaries, no-tie comparisons, pair de-duplication, all standard scoring/end conditions, seeded Daily generation, Daily persistence, and spoiler-free sharing text.

## Current dataset note

The included CSV has 1,506 rows, including its metadata and headers. It is the application’s bundled QS World University Rankings 2027 source; consult the publisher’s current material before using rankings for decisions outside this game.

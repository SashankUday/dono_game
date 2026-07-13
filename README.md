# Dono Higher or Lower

A static Dono-branded browser game for guessing whether one university is ranked higher or lower than another in the QS World University Rankings 2027.

## Run the game

Open `index.html` in a browser, or serve the folder with any static file server. The game uses vanilla HTML, CSS and JavaScript, with the shared game rules in `game-core.js`.

## Replace the rankings dataset

The displayed game data is embedded in the `<script type="text/csv" id="dono-rankings">` block in `index.html`. Replace that CSV block with a new annual export when rankings update.

The parser looks for rank, name and country/territory columns by heading, so the column order can change. Exact numerical ranks are included in play. Banded ranks such as `1201-1400` or `1401+` are retained as non-playable banded records rather than converted into invented positions.

The source CSV used for this version is also kept as `qs-rankings-2027.csv` for easier replacement and review.

## Pools and difficulty

Pools filter the exact-ranked dataset:

- `Global`: all eligible exact-ranked universities.
- `Top 200`: exact ranks from 1 to 200.
- `Top 50`: exact ranks from 1 to 50.
- `UK Universities`: country values normalised to United Kingdom.
- `US Universities`: country values normalised to United States of America.

Difficulty applies only to the Global pool and uses the absolute rank gap between the known university and challenger:

- `Easy`: 151 to 400.
- `Normal`: 50 to 150.
- `Hard`: 1 to 49.

Universities with the same numerical rank are never compared. Unordered pairs are tracked so `A vs B` is treated as the same pair as `B vs A`.

## Best scores

Best scores are saved in `localStorage` per configuration:

- `dono_hol_best_sudden_global_hard`
- `dono_hol_best_lives_top200`
- `dono_hol_best_timed_uk`

The most recent format, pool and Global difficulty are also saved locally. If `localStorage` is unavailable, the game continues without persistence.

## Tests

Run the core logic tests with:

```bash
node tests/game-core.test.js
```

The tests cover rank direction, pool filters, difficulty boundaries, game-ending rules, timed scoring, CSV parsing and pair deduplication.

## Dataset limitation

The QS source contains approximately 1,500 institutions, but many lower-ranked entries are published as rank bands. This game plays with all institutions that have exact numerical ranks and reports how many banded entries were excluded from play. The data layer also retains those banded records separately so a future version can support banded comparisons without misrepresenting them as exact ranks.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DonoHOL = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const FORMAT = {
    SUDDEN: 'sudden',
    LIVES: 'lives',
    TIMED: 'timed',
  };

  const POOL = {
    GLOBAL: 'global',
    TOP200: 'top200',
    TOP50: 'top50',
    UK: 'uk',
    US: 'us',
  };

  const DIFFICULTY = {
    EASY: 'easy',
    NORMAL: 'normal',
    HARD: 'hard',
  };

  const DIFFICULTY_RULES = {
    easy: { min: 151, max: 400, label: 'Easy' },
    normal: { min: 50, max: 150, label: 'Normal' },
    hard: { min: 1, max: 49, label: 'Hard' },
  };

  const FORMAT_LABELS = {
    sudden: 'Sudden Death',
    lives: 'Three Lives',
    timed: '60 Seconds',
  };

  const POOL_LABELS = {
    global: 'Global',
    top200: 'Top 200',
    top50: 'Top 50',
    uk: 'UK Universities',
    us: 'US Universities',
  };

  function parseCSV(text) {
    const cleanText = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < cleanText.length; i++) {
      const c = cleanText[i];
      if (inQuotes) {
        if (c === '"') {
          if (cleanText[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && cleanText[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function headerScore(row) {
    return row.reduce((score, cell) => {
      const value = cell.trim().toLowerCase();
      if (value === 'rank' || value === '2027' || /\brank\b/.test(value)) score += 2;
      if (value === 'name' || value === 'institution' || value === 'university') score += 2;
      if (/country|territory|location/.test(value)) score += 1;
      return score;
    }, 0);
  }

  function findHeaderRow(rows) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const score = headerScore(rows[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function findColumn(header, tests) {
    for (const test of tests) {
      const index = header.findIndex(test);
      if (index !== -1) return index;
    }
    return -1;
  }

  function normaliseCountry(country) {
    const raw = String(country || '').trim();
    const key = raw.toLowerCase();
    if (['uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland'].includes(key)) {
      return 'United Kingdom';
    }
    if (['us', 'usa', 'united states', 'united states of america'].includes(key)) {
      return 'United States of America';
    }
    return raw;
  }

  function loadUniversities(csvText) {
    const rows = parseCSV(csvText).filter(row => row.some(cell => cell.trim() !== ''));
    if (!rows.length) {
      return { universities: [], bandedUniversities: [], excludedBanded: 0, error: 'The rankings data is empty.' };
    }

    const headerIndex = findHeaderRow(rows);
    const header = rows[headerIndex].map(cell => cell.trim().toLowerCase());
    const rankCol = findColumn(header, [
      h => h === 'rank' || h === '2027' || h === 'ranking',
      h => /\brank\b/.test(h) && !/\bprevious\b|\bprev\b|\bar\b|\ber\b|\bfsr\b|\bcpf\b|\bifr\b|\bisr\b|\birn\b|\beo\b|\bsus\b/.test(h),
    ]);
    const nameCol = findColumn(header, [
      h => h === 'name' || h === 'institution' || h === 'university',
      h => /institution|university|\bname\b/.test(h),
    ]);
    const countryCol = findColumn(header, [
      h => /country|territory/.test(h),
      h => /location/.test(h),
    ]);

    if (rankCol === -1 || nameCol === -1) {
      return {
        universities: [],
        bandedUniversities: [],
        excludedBanded: 0,
        error: 'The rankings CSV needs columns for rank and university name.',
      };
    }

    const seen = new Set();
    const universities = [];
    const bandedUniversities = [];
    let excludedBanded = 0;
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = (row[nameCol] || '').trim();
      const rankRaw = (row[rankCol] || '').trim().replace(/=+$/, '');
      if (!name) continue;
      if (!/^\d+$/.test(rankRaw)) {
        if (rankRaw) {
          excludedBanded++;
          bandedUniversities.push({
            name,
            rankBand: rankRaw,
            country: normaliseCountry(countryCol !== -1 ? row[countryCol] : ''),
          });
        }
        continue;
      }
      const country = normaliseCountry(countryCol !== -1 ? row[countryCol] : '');
      const key = [name.toLowerCase(), rankRaw, country.toLowerCase()].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      universities.push({
        id: universities.length,
        name,
        rank: parseInt(rankRaw, 10),
        country,
      });
    }

    return { universities, bandedUniversities, excludedBanded, error: null };
  }

  function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return n + 'th';
    switch (n % 10) {
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }

  function pointsForLivesStreak(streak) {
    if (streak >= 10) return 5;
    if (streak >= 5) return 3;
    if (streak >= 3) return 2;
    return 1;
  }

  function buildPool(universities, poolKey) {
    if (poolKey === POOL.TOP200) return universities.filter(u => u.rank >= 1 && u.rank <= 200);
    if (poolKey === POOL.TOP50) return universities.filter(u => u.rank >= 1 && u.rank <= 50);
    if (poolKey === POOL.UK) return universities.filter(u => normaliseCountry(u.country) === 'United Kingdom');
    if (poolKey === POOL.US) return universities.filter(u => normaliseCountry(u.country) === 'United States of America');
    return universities.slice();
  }

  function pairKey(a, b) {
    return [Math.min(a.id, b.id), Math.max(a.id, b.id)].join(':');
  }

  function createPairSelector(pool, config, rng) {
    const random = rng || Math.random;
    const candidatesById = new Map();
    const difficulty = config.pool === POOL.GLOBAL ? DIFFICULTY_RULES[config.difficulty] : null;

    for (const current of pool) {
      const candidates = [];
      for (const challenger of pool) {
        if (challenger.id === current.id || challenger.rank === current.rank) continue;
        const gap = Math.abs(current.rank - challenger.rank);
        // Difficulty applies only to Global, with inclusive non-overlapping rank-gap bands.
        if (difficulty && (gap < difficulty.min || gap > difficulty.max)) continue;
        candidates.push(challenger);
      }
      candidatesById.set(current.id, candidates);
    }

    const viableStarts = pool.filter(u => (candidatesById.get(u.id) || []).length);
    if (viableStarts.length < 2) {
      throw new Error('This setup cannot create enough valid comparisons. Try a larger pool or an easier difficulty.');
    }

    const usedPairs = new Set();
    let usedUniversityIds = new Set();
    let previousChallengerId = null;

    function randomItem(items) {
      return items[Math.floor(random() * items.length)];
    }

    function chooseInitial() {
      const chosen = randomItem(viableStarts);
      usedUniversityIds.add(chosen.id);
      return chosen;
    }

    function chooseChallenger(current) {
      const allCandidates = candidatesById.get(current.id) || [];
      if (!allCandidates.length) {
        throw new Error('No valid challenger is available for this university.');
      }

      let available = allCandidates.filter(candidate => !usedPairs.has(pairKey(current, candidate)));
      if (!available.length) {
        // Pair history is reset only when needed, allowing long runs without freezing.
        usedPairs.clear();
        available = allCandidates.slice();
      }

      let preferred = available.filter(candidate =>
        !usedUniversityIds.has(candidate.id) && candidate.id !== previousChallengerId
      );
      if (!preferred.length && usedUniversityIds.size >= Math.max(2, Math.floor(pool.length * 0.8))) {
        // Once the pool has substantially cycled, start a fresh usage pass but avoid instant repeats.
        usedUniversityIds = new Set([current.id]);
        preferred = available.filter(candidate => candidate.id !== previousChallengerId);
      }
      if (!preferred.length) preferred = available.filter(candidate => candidate.id !== previousChallengerId);
      if (!preferred.length) preferred = available;

      const chosen = randomItem(preferred);
      usedPairs.add(pairKey(current, chosen));
      usedUniversityIds.add(current.id);
      usedUniversityIds.add(chosen.id);
      previousChallengerId = chosen.id;
      return chosen;
    }

    return { chooseInitial, chooseChallenger, candidatesById, usedPairs };
  }

  function isChallengerHigher(current, challenger) {
    // Lower numerical rank means closer to #1, so it is the higher-ranked university.
    return challenger.rank < current.rank;
  }

  function createGame(universities, options, rng) {
    const config = Object.assign({
      format: FORMAT.LIVES,
      pool: POOL.GLOBAL,
      difficulty: DIFFICULTY.NORMAL,
      timedDuration: 60,
      autoStartTimer: false,
    }, options || {});
    const pool = buildPool(universities, config.pool);
    const selector = createPairSelector(pool, config, rng);
    const state = {
      config,
      poolCount: pool.length,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correct: 0,
      incorrect: 0,
      attempts: 0,
      lives: config.format === FORMAT.LIVES ? 3 : null,
      timeRemaining: config.format === FORMAT.TIMED ? config.timedDuration : null,
      timerStarted: false,
      current: selector.chooseInitial(),
      challenger: null,
      phase: 'guessing',
      lastResult: null,
      endedByComparison: null,
    };
    state.challenger = selector.chooseChallenger(state.current);

    function endGame() {
      state.phase = 'over';
    }

    function guess(guessHigher) {
      if (state.phase !== 'guessing') return null;
      if (config.format === FORMAT.TIMED && state.timeRemaining <= 0) return null;
      if (config.format === FORMAT.TIMED) state.timerStarted = true;

      const wasCorrect = guessHigher === isChallengerHigher(state.current, state.challenger);
      const previousLives = state.lives;
      let points = 0;

      state.attempts++;
      if (wasCorrect) {
        state.correct++;
        state.streak++;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        points = config.format === FORMAT.LIVES ? pointsForLivesStreak(state.streak) : 1;
        state.score += points;
      } else {
        state.incorrect++;
        state.streak = 0;
        if (config.format === FORMAT.LIVES) state.lives = Math.max(0, state.lives - 1);
        if (config.format === FORMAT.TIMED) {
          points = -1;
          state.score = Math.max(0, state.score - 1);
        }
      }

      state.lastResult = {
        wasCorrect,
        challengerIsHigher: isChallengerHigher(state.current, state.challenger),
        points,
        lifeLost: config.format === FORMAT.LIVES && !wasCorrect && state.lives < previousLives,
        current: state.current,
        challenger: state.challenger,
      };

      if (config.format === FORMAT.SUDDEN && !wasCorrect) {
        state.endedByComparison = state.lastResult;
        state.phase = 'over';
      } else if (config.format === FORMAT.LIVES && state.lives <= 0) {
        state.endedByComparison = state.lastResult;
        state.phase = 'over';
      } else {
        state.phase = 'revealed';
      }
      return state.lastResult;
    }

    function next() {
      if (state.phase !== 'revealed') return false;
      state.current = state.challenger;
      state.challenger = selector.chooseChallenger(state.current);
      state.lastResult = null;
      state.phase = 'guessing';
      return true;
    }

    function tick(seconds) {
      if (config.format !== FORMAT.TIMED || state.phase === 'over' || !state.timerStarted) return state.timeRemaining;
      state.timeRemaining = Math.max(0, state.timeRemaining - seconds);
      if (state.timeRemaining <= 0) endGame();
      return state.timeRemaining;
    }

    return {
      get state() { return state; },
      get selector() { return selector; },
      guess,
      next,
      tick,
      endGame,
    };
  }

  function accuracy(correct, attempts) {
    return attempts ? Math.round((correct / attempts) * 100) : 0;
  }

  return {
    FORMAT,
    POOL,
    DIFFICULTY,
    DIFFICULTY_RULES,
    FORMAT_LABELS,
    POOL_LABELS,
    parseCSV,
    loadUniversities,
    normaliseCountry,
    ordinal,
    pointsForLivesStreak,
    buildPool,
    createPairSelector,
    createGame,
    pairKey,
    isChallengerHigher,
    accuracy,
  };
});

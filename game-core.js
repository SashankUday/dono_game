(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DonoHOL = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const FORMAT = {
    SUDDEN: 'sudden',
    LIVES: 'lives',
    TIMED: 'timed',
    DAILY: 'daily',
  };

  const POOL = {
    GLOBAL: 'global',
    TOP200: 'top200',
    TOP500: 'top500',
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
    timed: 'Timed',
    daily: 'Daily Challenge',
  };

  const DAILY_VERSION = 'v1';
  const DATASET_VERSION = 'qs2027';
  const DAILY_TIMEZONE = 'UTC';

  const POOL_LABELS = {
    global: 'Global',
    top200: 'Top 200',
    top500: 'Top 500',
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
      return { universities: [], dailyUniversities: [], bandedUniversities: [], excludedBanded: 0, error: 'The rankings data is empty.' };
    }

    const headerIndex = findHeaderRow(rows);
    const header = rows[headerIndex].map(cell => cell.trim().toLowerCase());
    const rankCol = findColumn(header, [
      h => h === 'rank' || h === '2027' || h === 'ranking',
      h => /\brank\b/.test(h) && !/\bprevious\b|\bprev\b|\bar\b|\ber\b|\bfsr\b|\bcpf\b|\bifr\b|\bisr\b|\birn\b|\beo\b|\bsus\b/.test(h),
    ]);
    const indexCol = findColumn(header, [h => h === 'index']);
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
        dailyUniversities: [],
        bandedUniversities: [],
        excludedBanded: 0,
        error: 'The rankings CSV needs columns for rank and university name.',
      };
    }

    const seen = new Set();
    const universities = [];
    const dailyUniversities = [];
    const bandedUniversities = [];
    let excludedBanded = 0;
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = (row[nameCol] || '').trim();
      const rankRaw = (row[rankCol] || '').trim().replace(/=+$/, '');
      if (!name) continue;
      if (!/^\d+$/.test(rankRaw)) {
        if (rankRaw) {
          const sourceIndex = parseInt((indexCol === -1 ? '' : row[indexCol]) || '', 10);
          const bandedUniversity = {
            id: dailyUniversities.length,
            name,
            // Rank bands cannot be compared directly, so use the source row index
            // as the published ordering value for every game mode.
            rank: Number.isFinite(sourceIndex) ? sourceIndex : parseInt(rankRaw, 10),
            country: normaliseCountry(countryCol !== -1 ? row[countryCol] : ''),
          };
          excludedBanded++;
          bandedUniversities.push(bandedUniversity);
          if (Number.isFinite(bandedUniversity.rank)) dailyUniversities.push(bandedUniversity);
        }
        continue;
      }
      const country = normaliseCountry(countryCol !== -1 ? row[countryCol] : '');
      const key = [name.toLowerCase(), rankRaw, country.toLowerCase()].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const university = {
        id: dailyUniversities.length,
        name,
        rank: parseInt(rankRaw, 10),
        country,
      };
      universities.push(university);
      dailyUniversities.push(university);
    }

    return { universities, dailyUniversities, bandedUniversities, excludedBanded, error: null };
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

  function getDailyDateKey(date) {
    const now = date || new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDailyDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function hashStringToSeed(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRng(seed) {
    let state = seed >>> 0;
    return function seededRandom() {
      state = Math.imul(state + 0x6D2B79F5, 1);
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(items, rng) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function dailySeedSource(options) {
    const opts = Object.assign({
      version: DAILY_VERSION,
      dataset: DATASET_VERSION,
      dateKey: getDailyDateKey(),
    }, options || {});
    return `dono-daily-${opts.version}-${opts.dataset}-${opts.dateKey}`;
  }

  function dailyStorageKey(options) {
    const opts = Object.assign({
      version: DAILY_VERSION,
      dataset: DATASET_VERSION,
      dateKey: getDailyDateKey(),
    }, options || {});
    return `dono_daily_state_${opts.version}_${opts.dataset}_${opts.dateKey}`;
  }

  function dailyLastCompletedKey(options) {
    const opts = Object.assign({ version: DAILY_VERSION, dataset: DATASET_VERSION }, options || {});
    return `dono_daily_last_completed_${opts.version}_${opts.dataset}`;
  }

  function createDailySequence(universities, options) {
    const opts = Object.assign({
      pool: POOL.GLOBAL,
      version: DAILY_VERSION,
      dataset: DATASET_VERSION,
      dateKey: getDailyDateKey(),
    }, options || {});
    const pool = buildPool(universities, opts.pool);
    const seed = hashStringToSeed(dailySeedSource(opts));
    const shuffled = seededShuffle(pool, createSeededRng(seed));
    const sequence = shuffled.slice();

    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i].rank !== sequence[i - 1].rank) continue;
      let swapIndex = -1;
      for (let j = i + 1; j < sequence.length; j++) {
        if (sequence[j].rank !== sequence[i - 1].rank) {
          swapIndex = j;
          break;
        }
      }
      if (swapIndex === -1) {
        sequence.splice(i, 1);
        i--;
      } else {
        const tmp = sequence[i];
        sequence[i] = sequence[swapIndex];
        sequence[swapIndex] = tmp;
      }
    }

    return sequence;
  }

  function createDailyState(universities, options) {
    const opts = Object.assign({
      dateKey: getDailyDateKey(),
      version: DAILY_VERSION,
      dataset: DATASET_VERSION,
      pool: POOL.GLOBAL,
      practice: false,
    }, options || {});
    const sequence = createDailySequence(universities, opts);
    if (sequence.length < 2) {
      throw new Error('Today’s Daily Challenge cannot create enough valid comparisons.');
    }
    return {
      date: opts.dateKey,
      version: opts.version,
      dataset: opts.dataset,
      pool: opts.pool,
      started: true,
      completed: false,
      practice: !!opts.practice,
      score: 0,
      correct: 0,
      incorrect: 0,
      streak: 0,
      bestStreak: 0,
      currentIndex: 0,
      livesRemaining: 3,
      answerPattern: [],
      history: [],
      sequenceIds: sequence.map(u => u.id),
    };
  }

  function serialiseDailyGameState(state) {
    return {
      date: state.date,
      version: state.version,
      dataset: state.dataset,
      pool: state.pool,
      started: state.started,
      completed: state.completed,
      practice: state.practice,
      score: state.score,
      correct: state.correct,
      incorrect: state.incorrect,
      streak: state.streak,
      bestStreak: state.bestStreak,
      currentIndex: state.currentIndex,
      livesRemaining: state.livesRemaining,
      answerPattern: state.answerPattern.slice(),
      history: (state.history || []).slice(),
      sequenceIds: state.sequenceIds.slice(),
      phase: state.phase,
      lastResult: state.lastResult || null,
    };
  }

  function loadDailyState(storage, storageKey) {
    try {
      const raw = storage && storage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveDailyState(storage, storageKey, state) {
    try {
      if (storage) storage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function createDailyShareText(state) {
    const pattern = (state.answerPattern || []).map(item => item === 'correct' ? '🟩' : '🟥').join('');
    return [
      'Dono Daily Rankings',
      formatDailyDate(state.date),
      '',
      `Score: ${state.score}`,
      `Best streak: ${state.bestStreak}`,
      `Comparisons: ${(state.answerPattern || []).length}`,
      pattern,
      '',
      'Can you beat it?',
    ].join('\n');
  }

  function buildPool(universities, poolKey) {
    if (poolKey === POOL.TOP200) return universities.filter(u => u.rank >= 1 && u.rank <= 200);
    if (poolKey === POOL.TOP500) return universities.filter(u => u.rank >= 1 && u.rank <= 500);
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

  function historyEntry(current, challenger, guessHigher, wasCorrect) {
    return {
      current: { name: current.name, rank: current.rank, country: current.country || '' },
      challenger: { name: challenger.name, rank: challenger.rank, country: challenger.country || '' },
      answer: guessHigher ? 'higher' : 'lower',
      wasCorrect,
    };
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
      history: [],
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
        if (config.format !== FORMAT.SUDDEN) {
          state.streak++;
          state.bestStreak = Math.max(state.bestStreak, state.streak);
        }
        points = config.format === FORMAT.LIVES ? pointsForLivesStreak(state.streak) : 1;
        state.score += points;
      } else {
        state.incorrect++;
        if (config.format !== FORMAT.SUDDEN) state.streak = 0;
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
      state.history.push(historyEntry(state.current, state.challenger, guessHigher, wasCorrect));

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

  function createDailyGame(universities, options, savedState) {
    const config = Object.assign({
      dateKey: getDailyDateKey(),
      version: DAILY_VERSION,
      dataset: DATASET_VERSION,
      pool: POOL.GLOBAL,
      practice: false,
    }, options || {});
    const state = savedState ? Object.assign({}, savedState, {
      answerPattern: (savedState.answerPattern || []).slice(),
      history: (savedState.history || []).slice(),
      sequenceIds: (savedState.sequenceIds || []).slice(),
      lastResult: savedState.lastResult || null,
      phase: savedState.phase,
      practice: !!savedState.practice,
    }) : createDailyState(universities, config);
    const byId = new Map(universities.map(university => [university.id, university]));

    function getBySequenceIndex(index) {
      return byId.get(state.sequenceIds[index]);
    }

    function current() {
      return getBySequenceIndex(state.currentIndex);
    }

    function challenger() {
      return getBySequenceIndex(state.currentIndex + 1);
    }

    function syncPhase() {
      if (state.completed || state.livesRemaining <= 0 || state.currentIndex >= state.sequenceIds.length - 1) {
        state.completed = true;
        state.phase = 'over';
      } else if (!state.phase || state.phase === 'over') {
        state.phase = 'guessing';
      }
    }

    syncPhase();
    if (!current() || !challenger()) {
      state.completed = true;
      state.phase = 'over';
    }

    function snapshot() {
      return Object.assign(serialiseDailyGameState(state), {
        phase: state.phase,
        current: current(),
        challenger: challenger(),
        attempts: state.answerPattern.length,
      });
    }

    function guess(guessHigher) {
      syncPhase();
      if (state.phase !== 'guessing') return null;
      const a = current();
      const b = challenger();
      if (!a || !b || a.id === b.id || a.rank === b.rank) return null;
      const challengerIsHigher = isChallengerHigher(a, b);
      const wasCorrect = guessHigher === challengerIsHigher;
      let points = 0;
      if (wasCorrect) {
        state.correct++;
        state.streak++;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        points = pointsForLivesStreak(state.streak);
        state.score += points;
        state.answerPattern.push('correct');
      } else {
        state.incorrect++;
        state.streak = 0;
        state.livesRemaining = Math.max(0, state.livesRemaining - 1);
        state.answerPattern.push('incorrect');
      }
      state.lastResult = {
        wasCorrect,
        challengerIsHigher,
        points,
        lifeLost: !wasCorrect,
        current: a,
        challenger: b,
      };
      state.history.push(historyEntry(a, b, guessHigher, wasCorrect));
      if (state.livesRemaining <= 0 || state.currentIndex + 1 >= state.sequenceIds.length - 1) {
        state.completed = true;
        state.phase = 'over';
      } else {
        state.phase = 'revealed';
      }
      return state.lastResult;
    }

    function next() {
      if (state.phase !== 'revealed') return false;
      state.currentIndex++;
      state.lastResult = null;
      state.phase = 'guessing';
      syncPhase();
      return state.phase === 'guessing';
    }

    function complete() {
      state.completed = true;
      state.phase = 'over';
    }

    return {
      get state() { return snapshot(); },
      get rawState() { return state; },
      guess,
      next,
      complete,
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
    DAILY_VERSION,
    DATASET_VERSION,
    DAILY_TIMEZONE,
    POOL_LABELS,
    parseCSV,
    loadUniversities,
    normaliseCountry,
    ordinal,
    pointsForLivesStreak,
    getDailyDateKey,
    formatDailyDate,
    hashStringToSeed,
    createSeededRng,
    seededShuffle,
    dailySeedSource,
    dailyStorageKey,
    dailyLastCompletedKey,
    createDailySequence,
    createDailyState,
    serialiseDailyGameState,
    loadDailyState,
    saveDailyState,
    createDailyShareText,
    buildPool,
    createPairSelector,
    createGame,
    createDailyGame,
    pairKey,
    isChallengerHigher,
    accuracy,
  };
});

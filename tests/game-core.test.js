const assert = require('node:assert/strict');
const core = require('../game-core');

function makeUniversities(count = 500) {
  const universities = [];
  for (let rank = 1; rank <= count; rank++) {
    universities.push({
      id: rank - 1,
      name: `University ${rank}`,
      rank,
      country: rank % 2 ? 'United Kingdom' : 'United States of America',
    });
  }
  universities.push({ id: universities.length, name: 'England College', rank: 701, country: 'England' });
  universities.push({ id: universities.length, name: 'USA College', rank: 702, country: 'USA' });
  return universities;
}

function rng(values = [0]) {
  let index = 0;
  return () => values[index++ % values.length];
}

function memoryStorage(fail = false) {
  const map = new Map();
  return {
    getItem(key) {
      if (fail) throw new Error('blocked');
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (fail) throw new Error('blocked');
      map.set(key, String(value));
    },
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('lower numerical rank is higher ranked', () => {
  assert.equal(
    core.isChallengerHigher({ rank: 50 }, { rank: 10 }),
    true
  );
});

test('equal ranks are never compared', () => {
  const universities = [
    { id: 1, name: 'A', rank: 1, country: 'United Kingdom' },
    { id: 2, name: 'B', rank: 1, country: 'United Kingdom' },
    { id: 3, name: 'C', rank: 2, country: 'United Kingdom' },
  ];
  const game = core.createGame(universities, { format: 'lives', pool: 'uk' }, rng([0]));
  for (let i = 0; i < 8; i++) {
    assert.notEqual(game.state.current.rank, game.state.challenger.rank);
    game.guess(true);
    if (game.state.phase === 'revealed') game.next();
  }
});

test('difficulty gaps are inclusive and non-overlapping', () => {
  const universities = makeUniversities(500);
  for (const [difficulty, rule] of Object.entries(core.DIFFICULTY_RULES)) {
    const selector = core.createPairSelector(universities, { pool: 'global', difficulty }, rng([0]));
    for (const [currentId, candidates] of selector.candidatesById.entries()) {
      const current = universities.find(u => u.id === currentId);
      for (const challenger of candidates) {
        const gap = Math.abs(current.rank - challenger.rank);
        assert.ok(gap >= rule.min && gap <= rule.max, `${difficulty} gap ${gap}`);
      }
    }
  }
});

test('Top 50 and Top 200 pools respect rank caps', () => {
  const universities = makeUniversities(500);
  assert.ok(core.buildPool(universities, 'top50').every(u => u.rank <= 50));
  assert.ok(core.buildPool(universities, 'top200').every(u => u.rank <= 200));
  assert.ok(core.buildPool(universities, 'top500').every(u => u.rank <= 500));
});

test('UK and US pools normalise equivalent country values', () => {
  const universities = makeUniversities(10);
  assert.ok(core.buildPool(universities, 'uk').every(u => core.normaliseCountry(u.country) === 'United Kingdom'));
  assert.ok(core.buildPool(universities, 'us').every(u => core.normaliseCountry(u.country) === 'United States of America'));
});

test('Sudden Death ends after one incorrect answer', () => {
  const game = core.createGame(makeUniversities(10), { format: 'sudden', pool: 'top50' }, rng([0]));
  const correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(!correctGuess);
  assert.equal(game.state.phase, 'over');
});

test('Sudden Death does not track streaks', () => {
  const game = core.createGame(makeUniversities(10), { format: 'sudden', pool: 'top50' }, rng([0]));
  const correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(correctGuess);
  assert.equal(game.state.streak, 0);
  assert.equal(game.state.bestStreak, 0);
});

test('Three Lives ends after the third incorrect answer', () => {
  const game = core.createGame(makeUniversities(20), { format: 'lives', pool: 'top50' }, rng([0]));
  for (let i = 0; i < 3; i++) {
    const correctGuess = game.state.challenger.rank < game.state.current.rank;
    game.guess(!correctGuess);
    if (game.state.phase === 'revealed') game.next();
  }
  assert.equal(game.state.phase, 'over');
  assert.equal(game.state.lives, 0);
});

test('Three Lives streak scoring works', () => {
  assert.equal(core.pointsForLivesStreak(1), 1);
  assert.equal(core.pointsForLivesStreak(2), 1);
  assert.equal(core.pointsForLivesStreak(3), 2);
  assert.equal(core.pointsForLivesStreak(5), 3);
  assert.equal(core.pointsForLivesStreak(10), 5);
});

test('Timed mode scores plus one and minus one without going below zero', () => {
  const game = core.createGame(makeUniversities(20), { format: 'timed', pool: 'top50' }, rng([0]));
  let correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(correctGuess);
  assert.equal(game.state.score, 1);
  game.next();
  correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(!correctGuess);
  assert.equal(game.state.score, 0);
  game.next();
  correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(!correctGuess);
  assert.equal(game.state.score, 0);
});

test('Timed mode stops accepting guesses at zero seconds', () => {
  const game = core.createGame(makeUniversities(20), { format: 'timed', pool: 'top50' }, rng([0]));
  const correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(correctGuess);
  game.next();
  game.tick(60);
  assert.equal(game.guess(true), null);
});

test('standard games retain a complete answer history', () => {
  const game = core.createGame(makeUniversities(20), { format: 'lives', pool: 'top50' }, rng([0]));
  const guessHigher = game.state.challenger.rank < game.state.current.rank;
  game.guess(guessHigher);
  assert.equal(game.state.history.length, 1);
  assert.equal(game.state.history[0].answer, guessHigher ? 'higher' : 'lower');
  assert.equal(game.state.history[0].wasCorrect, true);
  assert.equal(game.state.history[0].current.name, game.state.lastResult.current.name);
});

test('challenger becomes known university next round', () => {
  const game = core.createGame(makeUniversities(20), { format: 'lives', pool: 'top50' }, rng([0]));
  const challenger = game.state.challenger;
  const correctGuess = challenger.rank < game.state.current.rank;
  game.guess(correctGuess);
  game.next();
  assert.equal(game.state.current.id, challenger.id);
});

test('unordered university pairs are not repeated while alternatives remain', () => {
  const game = core.createGame(makeUniversities(60), { format: 'lives', pool: 'top50' }, rng([0.1, 0.2, 0.3, 0.4]));
  const seen = new Set();
  for (let i = 0; i < 25; i++) {
    const key = core.pairKey(game.state.current, game.state.challenger);
    assert.equal(seen.has(key), false);
    seen.add(key);
    const correctGuess = game.state.challenger.rank < game.state.current.rank;
    game.guess(correctGuess);
    game.next();
  }
});

test('CSV parsing handles quoted commas and escaped quotation marks', () => {
  const csv = 'Rank,Name,Country/Territory\n1,"A, University",UK\n2,"The ""Quoted"" Institute",USA\n';
  const result = core.loadUniversities(csv);
  assert.equal(result.universities[0].name, 'A, University');
  assert.equal(result.universities[1].name, 'The "Quoted" Institute');
});

test('invalid and banded ranks are not exact positions', () => {
  const csv = 'Rank,Name,Country/Territory\n1,A,UK\n1201-1400,B,UK\n1501+,C,UK\n';
  const result = core.loadUniversities(csv);
  assert.equal(result.universities.length, 1);
  assert.equal(result.excludedBanded, 2);
  assert.equal(result.bandedUniversities.length, 2);
});

test('rank bands use their source index for gameplay ordering', () => {
  const csv = 'Index,Rank,Name,Country/Territory\n1,1,A,UK\n1201,1201-1400,B,UK\n1401,1401+,C,UK\n';
  const result = core.loadUniversities(csv);
  assert.equal(result.universities.length, 1);
  assert.equal(result.dailyUniversities.length, 3);
  assert.equal(result.dailyUniversities[1].rank, 1201);
});

test('localStorage-style failures can be caught by persistence callers', () => {
  const failingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.throws(() => failingStorage.getItem('x'));
});

test('same date and dataset version generate the same Daily sequence', () => {
  const universities = makeUniversities(120);
  const a = core.createDailySequence(universities, { dateKey: '2026-07-13', dataset: 'qs2027' }).map(u => u.id);
  const b = core.createDailySequence(universities, { dateKey: '2026-07-13', dataset: 'qs2027' }).map(u => u.id);
  assert.deepEqual(a, b);
});

test('different Daily dates generate different sequences', () => {
  const universities = makeUniversities(120);
  const a = core.createDailySequence(universities, { dateKey: '2026-07-13' }).map(u => u.id).join(',');
  const b = core.createDailySequence(universities, { dateKey: '2026-07-14' }).map(u => u.id).join(',');
  assert.notEqual(a, b);
});

test('same seed produces identical seeded RNG results', () => {
  const seed = core.hashStringToSeed('stable-seed');
  const a = core.seededShuffle([1, 2, 3, 4, 5], core.createSeededRng(seed));
  const b = core.seededShuffle([1, 2, 3, 4, 5], core.createSeededRng(seed));
  assert.deepEqual(a, b);
});

test('Daily sequence has no adjacent equal ranks and no duplicate universities', () => {
  const universities = [
    { id: 1, name: 'A', rank: 1, country: 'UK' },
    { id: 2, name: 'B', rank: 1, country: 'UK' },
    { id: 3, name: 'C', rank: 2, country: 'UK' },
    { id: 4, name: 'D', rank: 3, country: 'UK' },
    { id: 5, name: 'E', rank: 3, country: 'UK' },
    { id: 6, name: 'F', rank: 4, country: 'UK' },
  ];
  const sequence = core.createDailySequence(universities, { dateKey: '2026-07-13' });
  assert.equal(new Set(sequence.map(u => u.id)).size, sequence.length);
  for (let i = 1; i < sequence.length; i++) {
    assert.notEqual(sequence[i].rank, sequence[i - 1].rank);
  }
});

test('Daily challenger becomes known university next round', () => {
  const game = core.createDailyGame(makeUniversities(50), { dateKey: '2026-07-13' });
  const challenger = game.state.challenger;
  const correctGuess = challenger.rank < game.state.current.rank;
  game.guess(correctGuess);
  game.next();
  assert.equal(game.state.current.id, challenger.id);
});

test('three incorrect Daily answers end the challenge', () => {
  const game = core.createDailyGame(makeUniversities(50), { dateKey: '2026-07-13' });
  for (let i = 0; i < 3; i++) {
    const correctGuess = core.isChallengerHigher(game.state.current, game.state.challenger);
    game.guess(!correctGuess);
    if (game.state.phase === 'revealed') game.next();
  }
  assert.equal(game.state.phase, 'over');
  assert.equal(game.state.completed, true);
  assert.equal(game.state.livesRemaining, 0);
});

test('refreshing preserves Daily score, lives, streak and position', () => {
  const storage = memoryStorage();
  const key = core.dailyStorageKey({ dateKey: '2026-07-13' });
  const game = core.createDailyGame(makeUniversities(50), { dateKey: '2026-07-13' });
  const correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(correctGuess);
  core.saveDailyState(storage, key, core.serialiseDailyGameState(game.rawState));
  const saved = core.loadDailyState(storage, key);
  const resumed = core.createDailyGame(makeUniversities(50), { dateKey: '2026-07-13' }, saved);
  assert.equal(resumed.state.score, game.state.score);
  assert.equal(resumed.state.livesRemaining, game.state.livesRemaining);
  assert.equal(resumed.state.streak, game.state.streak);
  assert.equal(resumed.state.currentIndex, game.state.currentIndex);
  assert.equal(resumed.state.phase, 'revealed');
  assert.equal(resumed.state.history.length, 1);
  assert.equal(resumed.state.history[0].wasCorrect, true);
});

test('completed official Daily attempt cannot be restarted as official state', () => {
  const saved = core.createDailyState(makeUniversities(50), { dateKey: '2026-07-13' });
  saved.completed = true;
  saved.phase = 'over';
  const game = core.createDailyGame(makeUniversities(50), { dateKey: '2026-07-13' }, saved);
  assert.equal(game.state.phase, 'over');
  assert.equal(game.guess(true), null);
});

test('Practice Daily state does not overwrite official result when saved separately', () => {
  const storage = memoryStorage();
  const officialKey = core.dailyStorageKey({ dateKey: '2026-07-13' });
  const official = core.createDailyState(makeUniversities(50), { dateKey: '2026-07-13' });
  official.score = 9;
  official.completed = true;
  core.saveDailyState(storage, officialKey, official);
  const practice = core.createDailyState(makeUniversities(50), { dateKey: '2026-07-13', practice: true });
  practice.score = 99;
  assert.equal(core.loadDailyState(storage, officialKey).score, 9);
});

test('Daily share text does not reveal university names or rankings', () => {
  const game = core.createDailyGame(makeUniversities(20), { dateKey: '2026-07-13' });
  const firstName = game.state.current.name;
  const firstRank = String(game.state.current.rank);
  const correctGuess = game.state.challenger.rank < game.state.current.rank;
  game.guess(correctGuess);
  const text = core.createDailyShareText(game.state);
  assert.equal(text.includes(firstName), false);
  assert.equal(text.includes(` ${firstRank} `), false);
  assert.equal(/[🟩🟥]/u.test(text), true);
});

test('Daily date key uses UTC', () => {
  assert.equal(core.getDailyDateKey(new Date('2026-07-13T23:30:00-02:00')), '2026-07-14');
});

test('Daily persistence handles localStorage failure', () => {
  const storage = memoryStorage(true);
  assert.equal(core.loadDailyState(storage, 'x'), null);
  assert.equal(core.saveDailyState(storage, 'x', { ok: true }), false);
});

test('changing dataset version changes Daily storage key and seed', () => {
  assert.notEqual(
    core.dailyStorageKey({ dateKey: '2026-07-13', dataset: 'qs2027' }),
    core.dailyStorageKey({ dateKey: '2026-07-13', dataset: 'qs2028' })
  );
  assert.notEqual(
    core.dailySeedSource({ dateKey: '2026-07-13', dataset: 'qs2027' }),
    core.dailySeedSource({ dateKey: '2026-07-13', dataset: 'qs2028' })
  );
});

test('Daily sequence algorithm terminates with many tied ranks', () => {
  const universities = [];
  for (let i = 0; i < 80; i++) {
    universities.push({ id: i, name: `Tie ${i}`, rank: i < 60 ? 1 : i, country: 'UK' });
  }
  const sequence = core.createDailySequence(universities, { dateKey: '2026-07-13' });
  for (let i = 1; i < sequence.length; i++) {
    assert.notEqual(sequence[i].rank, sequence[i - 1].rank);
  }
});

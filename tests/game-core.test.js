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

test('localStorage-style failures can be caught by persistence callers', () => {
  const failingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.throws(() => failingStorage.getItem('x'));
});

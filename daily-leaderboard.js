(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DonoDailyLeaderboard = api;
})(typeof window === 'undefined' ? null : window, function (root) {
  'use strict';
  const NAME_KEY = 'dono_daily_leaderboard_display_name';
  const SUBMISSION_PREFIX = 'dono_daily_leaderboard_submission_';
  const active = new Map();
  let client = null; let authTask = null; let nameTask = null;

  function validateDisplayName(value) { const name = String(value || '').trim(); return name.length >= 2 && name.length <= 24 ? { valid: true, name, error: '' } : { valid: false, name, error: 'Use a name between 2 and 24 characters.' }; }
  function submissionKey(date) { return SUBMISSION_PREFIX + date; }
  function isUniqueConstraint(error) { return !!error && (error.code === '23505' || /unique/i.test(error.message || '')); }
  function compareScores(a, b) { return (b.score - a.score) || (b.best_streak - a.best_streak) || String(a.created_at).localeCompare(String(b.created_at)); }
  function validConfig(config) { try { return !!(config && config.publishableKey && new URL(config.url).protocol === 'https:'); } catch (error) { return false; } }
  function read(key, fallback) { try { return root.localStorage.getItem(key) || fallback; } catch (error) { return fallback; } }
  function write(key, value) { try { root.localStorage.setItem(key, value); } catch (error) { /* local storage is optional */ } }
  function state(date) { try { return JSON.parse(read(submissionKey(date), '{}')); } catch (error) { return {}; } }
  function saveState(date, value) { write(submissionKey(date), JSON.stringify(value)); }
  function getClient() {
    if (client) return client;
    const config = root && root.DONO_SUPABASE_CONFIG;
    if (!validConfig(config) || !root.supabase || typeof root.supabase.createClient !== 'function') { console.warn('[Dono leaderboard] Supabase configuration or browser client is unavailable. Leaderboard is disabled.'); return null; }
    client = root.supabase.createClient(config.url, config.publishableKey); return client;
  }
  async function getUser() {
    const supabase = getClient(); if (!supabase) return { user: null, error: Error('Unavailable') };
    if (!authTask) authTask = (async () => { const old = await supabase.auth.getUser(); return old.data && old.data.user ? old : supabase.auth.signInAnonymously(); })();
    const result = await authTask; return { user: result.data && result.data.user, error: result.error };
  }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function shell(container) {
    container.replaceChildren(); const card = el('section', 'leaderboard-card'); const heading = el('div', 'leaderboard-heading'); const title = el('div'); title.append(el('h3', '', 'Daily leaderboard'), el('p', '', 'Today’s official scores')); heading.append(title);
    const body = el('div', 'leaderboard-body'); const content = el('div'); const status = el('p', 'leaderboard-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); body.append(content, status); card.append(heading, body); container.append(card); return { content, status };
  }
  function status(ui, text, kind) { ui.status.textContent = text || ''; ui.status.className = 'leaderboard-status' + (kind ? ' ' + kind : ''); }
  function renderRows(ui, rows, own, rank) {
    ui.content.replaceChildren(); if (!rows.length) { ui.content.append(el('p', 'leaderboard-empty', 'No scores yet. Be the first to set today’s score.')); return; }
    const list = el('ol', 'leaderboard-list'); rows.forEach((row, index) => { const item = el('li', 'leaderboard-row' + (own && row.user_id === own.user_id ? ' current-player' : '')); item.append(el('span', 'leaderboard-rank', String(index + 1)), el('span', 'leaderboard-name', row.display_name), el('span', 'leaderboard-value', 'Score ' + row.score), el('span', 'leaderboard-value leaderboard-streak', 'Best streak ' + row.best_streak)); list.append(item); }); ui.content.append(list);
    if (own && rank > 10) ui.content.append(el('p', 'leaderboard-own-position', 'Your position: #' + rank + ' · Score ' + own.score + ' · Best streak ' + own.best_streak));
  }
  async function ownRow(supabase, date, userId) { return supabase.from('daily_scores').select('user_id, display_name, score, best_streak, created_at').eq('challenge_date', date).eq('user_id', userId).maybeSingle(); }
  async function ownRank(supabase, date, row) {
    const query = () => supabase.from('daily_scores').select('id', { count: 'exact', head: true }).eq('challenge_date', date);
    const results = await Promise.all([query().gt('score', row.score), query().eq('score', row.score).gt('best_streak', row.best_streak), query().eq('score', row.score).eq('best_streak', row.best_streak).lt('created_at', row.created_at)]);
    const error = results.find(result => result.error); return error ? { error: error.error } : { rank: 1 + results.reduce((sum, result) => sum + (result.count || 0), 0) };
  }
  async function load(supabase, date, userId) {
    const top = await supabase.from('daily_scores').select('user_id, display_name, score, best_streak, created_at').eq('challenge_date', date).order('score', { ascending: false }).order('best_streak', { ascending: false }).order('created_at', { ascending: true }).limit(10);
    if (top.error) return { error: top.error }; const mine = await ownRow(supabase, date, userId); if (mine.error) return { error: mine.error }; const ranked = mine.data ? await ownRank(supabase, date, mine.data) : {}; return { rows: top.data || [], own: mine.data, rank: ranked.rank, error: ranked.error };
  }
  function requestName(initial) {
    if (nameTask) return nameTask;
    nameTask = new Promise(resolve => {
      const dialog = el('dialog', 'leaderboard-name-dialog'); const form = el('form', 'leaderboard-name-panel'); form.method = 'dialog'; const close = el('button', 'dialog-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close display name dialog'); const heading = el('h2', '', initial ? 'Change display name' : 'Choose a display name'); const note = el('p', '', 'This name appears with future Daily Challenge scores.'); const label = el('label', '', 'Display name'); const input = el('input'); input.id = 'daily-leaderboard-name'; input.maxLength = 24; input.value = initial || ''; label.htmlFor = input.id; const error = el('p', 'leaderboard-name-error'); error.setAttribute('aria-live', 'polite'); const actions = el('div', 'leaderboard-name-actions'); const cancel = el('button', 'btn-secondary', 'Not now'); cancel.type = 'button'; const save = el('button', 'btn-primary', 'Save name'); save.type = 'submit'; actions.append(cancel, save); form.append(close, heading, note, label, input, error, actions); dialog.append(form); document.body.append(dialog);
      let done = false; const finish = value => { if (done) return; done = true; dialog.remove(); nameTask = null; resolve(value); }; close.onclick = () => dialog.close('cancel'); cancel.onclick = () => dialog.close('cancel'); dialog.addEventListener('close', () => finish(null)); form.addEventListener('submit', event => { event.preventDefault(); const checked = validateDisplayName(input.value); if (!checked.valid) { error.textContent = checked.error; input.focus(); return; } finish(checked.name); }); dialog.showModal(); input.focus(); input.select();
    }); return nameTask;
  }
  async function insert(supabase, payload) {
    const result = await supabase.from('daily_scores').insert(payload).select('user_id, display_name, score, best_streak, created_at').single();
    if (!result.error) return { row: result.data }; if (!isUniqueConstraint(result.error)) return { error: result.error }; const existing = await ownRow(supabase, payload.challenge_date, payload.user_id); return existing.error ? { error: existing.error } : { row: existing.data, duplicate: true };
  }
  async function submit(context, user, ui, forceNamePrompt) {
    const savedState = state(context.date);
    if (savedState.status === 'confirmed' && savedState.userId === user.id) return;
    if (savedState.status === 'awaiting_name' && savedState.userId === user.id && !forceNamePrompt) return;
    if (active.has(context.date)) return active.get(context.date);
    const task = (async () => {
      let name = validateDisplayName(read(NAME_KEY, '')).name;
      if (!name) { name = await requestName(''); if (!name) { saveState(context.date, { status: 'awaiting_name', userId: user.id }); status(ui, 'Add a display name when you’re ready to submit.', ''); return; } write(NAME_KEY, name); }
      saveState(context.date, { status: 'submitting', userId: user.id }); status(ui, 'Submitting your score…'); const result = await insert(context.supabase, { user_id: user.id, display_name: name, challenge_date: context.date, score: context.score, best_streak: context.bestStreak });
      if (result.error) { saveState(context.date, { status: 'pending', userId: user.id }); status(ui, 'Your score could not be submitted. You can try again.', 'error'); return; }
      saveState(context.date, { status: 'confirmed', userId: user.id }); status(ui, result.duplicate ? 'Already submitted — showing your recorded score.' : 'Score submitted.', 'success'); await context.reload();
    })().finally(() => active.delete(context.date)); active.set(context.date, task); return task;
  }
  function actions(context, user, ui) {
    const area = el('div', 'leaderboard-actions'); if (state(context.date).status !== 'confirmed') { const retry = el('button', 'btn-secondary', 'Submit score'); retry.type = 'button'; retry.onclick = () => submit(context, user, ui, true); area.append(retry); }
    const change = el('button', 'btn-secondary', 'Change display name'); change.type = 'button'; change.onclick = async () => { const name = await requestName(validateDisplayName(read(NAME_KEY, '')).name); if (name) { write(NAME_KEY, name); status(ui, 'Saved for future Daily Challenges.', 'success'); } }; area.append(change); ui.content.append(area);
  }
  async function show(options) {
    if (!root || !options || !options.container || options.practice) return; const ui = shell(options.container); const supabase = getClient(); if (!supabase) { ui.content.append(el('p', 'leaderboard-unavailable', 'Leaderboard unavailable. Your Daily result is saved on this device.')); return; }
    status(ui, 'Loading leaderboard…'); const auth = await getUser(); if (auth.error || !auth.user) { ui.content.append(el('p', 'leaderboard-unavailable', 'Leaderboard unavailable. Your Daily result is saved on this device.')); status(ui, ''); return; }
    const context = { supabase, date: options.challengeDate, score: options.score, bestStreak: options.bestStreak, reload: null }; context.reload = async () => { const data = await load(supabase, context.date, auth.user.id); if (data.error) { status(ui, 'Leaderboard could not be refreshed.', 'error'); return; } renderRows(ui, data.rows, data.own, data.rank); actions(context, auth.user, ui); };
    await context.reload(); await submit(context, auth.user, ui);
  }
  return { show, validateDisplayName, submissionKey, isUniqueConstraint, compareScores, validConfig };
});

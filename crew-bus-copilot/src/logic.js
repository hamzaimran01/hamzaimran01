import { Engine } from './engine.js';
import { Parser } from './parser.js';
import { SAMPLE_TASKS, SAMPLE_BUSES, RULES, DATA_VERSION } from './data.js';

export const fmt = Engine.fmt;
export const ids = (a) => a.join('+');
/** Short list for messages: first n items, then "and N more". */
export const shortList = (a, n = 8) => (a.length <= n ? a.join(', ') : a.slice(0, n).join(', ') + ' and ' + (a.length - n) + ' more');
export const tids = (tr) => tr.tasks.map((x) => x.id);
export const shortLoc = (l) => l.replace('Crew Center', 'Crew Ctr');

/* Today's call-by-call dispatcher, for generated tasks: in ready order, each call goes to one of the
   three buses that can reach the pickup soonest (seeded), one run per call, no sharing. */
function recordDispatcher(tasks, buses) {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const st = {}; buses.forEach((b) => { st[b.id] = { loc: b.start, avail: b.shiftStart, end: b.shiftEnd }; });
  tasks.slice().sort((a, b) => a.ready - b.ready || a.due - b.due).forEach((t) => {
    const own = t.dispatcherBus && st[t.dispatcherBus];
    let id = t.dispatcherBus;
    if (!own) {
      const c = buses.map((b) => ({ id: b.id, at: Math.max(st[b.id].avail + Engine.drive(st[b.id].loc, t.from), t.ready) }))
        .filter((x) => x.at < st[x.id].end).sort((x, y) => x.at - y.at).slice(0, 3);
      if (!c.length) return;
      id = c[Math.floor(rnd() * c.length)].id; t.dispatcherBus = id;
    }
    const s = st[id], arrive = Math.max(s.avail + Engine.drive(s.loc, t.from), t.ready);
    s.avail = arrive + RULES.boarding + Engine.drive(t.from, t.to) + RULES.dropoff; s.loc = t.to;
  });
}

export function freshScenario() {
  const buses = SAMPLE_BUSES.map((b) => {
    const p = b.shift.split('-');
    return { ...b, shiftStart: Engine.toMin(p[0]), shiftEnd: Engine.toMin(p[1]), outFrom: null };
  });
  const tasks = SAMPLE_TASKS.map((t) => {
    const r = Engine.toMin(t.ready), d = Engine.toMin(t.due);
    return { ...t, ready: r, due: d, origReady: r, origDue: d, flags: [] };
  });
  recordDispatcher(tasks, buses);
  return { version: DATA_VERSION, tasks, buses, log: [], overrides: {}, overrideFrom: {}, accepted: {}, lastChange: null, nextId: tasks.length + 1, history: [] };
}
export const clone = (o) => JSON.parse(JSON.stringify(o));
export function computePlans(S) {
  return { plan: Engine.planCopilot(S.tasks, S.buses, S.overrides), base: Engine.planBaseline(S.tasks, S.buses) };
}
export const taskOf = (S, id) => S.tasks.find((t) => t.id === id);
export const busOf = (S, id) => S.buses.find((b) => b.id === id);
export const busOutLabel = (b) => (b.outFrom === 0 ? 'Out of service' : b.outFrom != null ? 'Out of service from ' + fmt(b.outFrom) : '');
export const uniqFlights = (S) => [...new Set(S.tasks.map((t) => t.flight))];

export function statusOf(S, plan, id) {
  const a = plan.byTask[id];
  if (!a) return 'unassigned';
  if (S.overrides[id]) return 'overruled';
  if (S.accepted[id] === a.bus) return 'accepted';
  return 'open';
}

function applyCmd(S, c) {
  if (c.type === 'delay') {
    const ts = S.tasks.filter((t) => t.flight === c.flight);
    if (!ts.length) return { ok: false, msg: 'No crew task for ' + c.flight + ' today. Flights in this sample: ' + uniqFlights(S).join(', ') + '.' };
    ts.forEach((t) => {
      t.ready += c.minutes; t.due += c.minutes;
      const d = t.ready - t.origReady;
      t.flags = t.flags.filter((f) => !/^delay/.test(f));
      if (d) t.flags.push('delay ' + (d > 0 ? '+' : '') + d + ' min');
    });
    return { ok: true, msg: c.flight + ': ' + ts.map((t) => t.id).join(', ') + ' moved ' + (c.minutes > 0 ? '+' : '') + c.minutes + ' min.' };
  }
  if (c.type === 'busOut' || c.type === 'busBack') {
    const b = busOf(S, c.bus);
    if (!b) return { ok: false, msg: 'There is no bus ' + c.bus + '. Buses: ' + S.buses.map((x) => x.id).join(', ') + '.' };
    if (c.type === 'busBack') {
      if (b.outFrom == null) return { ok: false, msg: c.bus + ' is already in service.' };
      b.outFrom = null;
      return { ok: true, msg: c.bus + ' is back in service.' };
    }
    b.outFrom = c.at ? Engine.toMin(c.at) : 0;
    const freed = [];
    Object.keys(S.overrides).forEach((k) => { if (S.overrides[k] === c.bus) { delete S.overrides[k]; delete S.overrideFrom[k]; freed.push(k); } });
    return { ok: true, msg: c.bus + ' out of service' + (c.at ? ' from ' + c.at + ' (earlier runs kept)' : '') + '. Its runs were re-planned.' + (freed.length ? ' Overrides removed: ' + freed.join(', ') + '.' : '') };
  }
  if (c.type === 'cancel') {
    const idl = S.tasks.filter((t) => t.flight === c.flight).map((t) => t.id);
    if (!idl.length) return { ok: false, msg: 'No crew task for ' + c.flight + '.' };
    S.tasks = S.tasks.filter((t) => t.flight !== c.flight);
    idl.forEach((k) => { delete S.overrides[k]; delete S.overrideFrom[k]; delete S.accepted[k]; });
    return { ok: true, msg: c.flight + ' cancelled: ' + idl.join(', ') + ' removed.' };
  }
  if (c.type === 'add') {
    const t = c.task, r = Engine.toMin(t.ready), d = Engine.toMin(t.due);
    if (d <= r) return { ok: false, msg: 'The due time must be after the ready time.' };
    if (t.pax < 1 || t.pax > RULES.capacity) return { ok: false, msg: 'Crew size must be 1–' + RULES.capacity + ' (one bus). Split larger crews into two tasks.' };
    if (t.dispatcherBus && !busOf(S, t.dispatcherBus)) return { ok: false, msg: 'There is no bus ' + t.dispatcherBus + '.' };
    const id = 'T' + String(S.nextId++).padStart(2, '0');
    S.tasks.push({ ...t, id, ready: r, due: d, origReady: r, origDue: d, flags: ['added'] });
    return { ok: true, msg: id + ' added: ' + t.flight + ' ' + t.dir + ', ' + t.pax + ' crew, ' + t.from + ' → ' + t.to + ', ready ' + t.ready + ', due ' + t.due + '.' + (c.assumed.length ? ' Assumed ' + c.assumed.join(', ') + '.' : '') };
  }
  return { ok: false, msg: 'Not understood.' };
}

function busMap(S) {
  const p = Engine.planCopilot(S.tasks, S.buses, S.overrides), m = {};
  Object.keys(p.byTask).forEach((k) => { m[k] = p.byTask[k].bus; });
  return m;
}

/** Apply plain-words disruption text. Returns a new scenario plus per-line results. */
export function applyText(S0, text) {
  const cmds = Parser.parse(text);
  if (!cmds.length) return null;
  const before = busMap(S0);
  let S = clone(S0);
  const results = [];
  for (const c of cmds) {
    if (c.type === 'error') { results.push({ ok: false, text: c.text, msg: c.hint }); continue; }
    if (c.type === 'undo') {
      const prev = S.history.pop();
      if (!prev) { results.push({ ok: false, text: c.text, msg: 'Nothing to undo.' }); continue; }
      const h = S.history; S = prev; S.history = h;
      results.push({ ok: true, text: c.text, msg: 'Last change undone.' }); continue;
    }
    if (c.type === 'reset') { S = freshScenario(); results.push({ ok: true, text: c.text, msg: 'Back to the original sample day. Decisions cleared.' }); continue; }
    const snap = clone(S); delete snap.history;
    const r = applyCmd(S, c);
    results.push({ ok: r.ok, text: c.text, msg: r.msg, type: c.type });
    if (r.ok) { S.history.push(snap); if (S.history.length > 30) S.history.shift(); S.log.push({ text: c.text, msg: r.msg }); }
  }
  const after = busMap(S);
  const changed = Object.keys(after).filter((k) => before[k] !== after[k]);
  const oks = results.filter((r) => r.ok);
  if (oks.length) S.lastChange = { text: oks.map((r) => r.text).join('; '), changed };
  return { S, results, changed, okText: oks.map((r) => r.text).join('; ') };
}

export const parsesClean = (q) => { const c = Parser.parse(q); return c.length > 0 && c.every((x) => x.type !== 'error'); };
export const HELP = Parser.HELP;

export function why(S, plan, id) {
  const a = plan.byTask[id], dec = plan.decisions[id], t = taskOf(S, id);
  if (!a) return 'No bus can serve this task within its shift.';
  const tr = a.trip, res = a.res;
  const others = tr.tasks.filter((x) => x.id !== id);
  const prev = tr.index > 0 ? plan.buses.find((x) => x.id === a.bus).trips[tr.index - 1] : null;
  const parts = [];
  if (S.overrides[id]) parts.push('You overruled the copilot (it proposed ' + (S.overrideFrom[id] || '?') + ')');
  parts.push(a.bus + (prev ? ' is free at ' + tr.startLoc + ' after ' + ids(tids(prev)) + ' (' + fmt(tr.startAvail) + ')' : ' starts at ' + tr.startLoc) + ', so it drives ' + tr.r.empty + ' min empty');
  if (others.length) {
    const pax = tr.tasks.reduce((s, x) => s + x.pax, 0), n = tr.r.route.length - 1;
    parts.push('shares the bus with ' + ids(others.map((x) => x.id)) + ' (' + pax + ' of ' + RULES.capacity + ' seats, ' + n + (t.dir === 'DEP' ? ' drop-off' : ' pickup') + (n > 1 ? 's' : '') + ')');
  }
  parts.push((t.dir === 'DEP' ? 'crew at the aircraft ' + fmt(res.doneAt) : 'crew picked up ' + fmt(res.pickupAt)) + ', due ' + fmt(t.due) + (res.late ? ' (' + res.late + ' min late)' : ''));
  let s = parts.join('; ') + '.';
  if (dec && dec.runner && !S.overrides[id]) s += ' Score ' + dec.score + ', next best ' + dec.runner.bus + ' ' + dec.runner.score + (dec.runner.score === dec.score ? ' with more driving' : '') + '.';
  else if (dec && !dec.runner && !S.overrides[id]) s += ' No other bus can do it.';
  return s;
}

export function overruleOptions(S, plan, id) {
  const cur = plan.byTask[id].bus;
  const t = taskOf(S, id);
  return S.buses.filter((b) => b.id !== cur && b.outFrom !== 0)
    .sort((x, y) => Engine.drive(x.start, t.from) - Engine.drive(y.start, t.from) || (x.id < y.id ? -1 : 1)).slice(0, 6).map((b) => {
    const p = Engine.planCopilot(S.tasks, S.buses, { ...S.overrides, [id]: b.id }), a = p.byTask[id];
    if (!a || a.bus !== b.id) return { bus: b.id, ok: false, label: b.id + ': cannot do it' };
    const d = p.metrics.lateMin - plan.metrics.lateMin, de = p.metrics.empty - plan.metrics.empty;
    return { bus: b.id, ok: true, label: b.id + ': ' + (a.res.late ? a.res.late + ' min late' : 'on time') + ', plan ' + (d ? (d > 0 ? '+' : '') + d + ' late min, ' : '') + (de >= 0 ? '+' : '') + de + ' empty min' };
  });
}

/* ---------- live ---------- */
export function liveRange(p) {
  const a = [];
  p.buses.forEach((b) => b.trips.forEach((tr) => tr.r.steps.forEach((s) => a.push(s.start, s.end))));
  if (!a.length) return [360, 435];
  return [Math.floor((Math.min(...a) - 5) / 5) * 5, Math.ceil((Math.max(...a) + 5) / 5) * 5];
}
export function fmtSec(m) {
  const s = Math.floor(m * 60 + 1e-6), h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60, se = s % 60;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':' + String(se).padStart(2, '0');
}
export const inMin = (x, t) => { const d = Math.ceil(x - t - 1e-6); return d <= 0 ? 'now' : 'in ' + d + ' min'; };
export const realNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };

export function busNow(S, b, t) {
  const src = busOf(S, b.id);
  const out = src.outFrom === 0 || (src.outFrom != null && t >= src.outFrom);
  let cur = null, curTrip = null, prevTrip = null, nextTrip = null;
  b.trips.forEach((tr) => {
    if (tr.r.end <= t) prevTrip = tr;
    else if (tr.r.start <= t) { curTrip = tr; tr.r.steps.forEach((s) => { if (t >= s.start && t < s.end) cur = s; }); }
    else if (!nextTrip) nextTrip = tr;
  });
  const loc = prevTrip ? prevTrip.r.endLoc : b.start;
  const st = { kind: 'idle', label: 'Standby', what: 'at ' + loc, until: null, start: null, progress: null, next: nextTrip, trip: curTrip, cur, loc };
  const pax = (list) => list.reduce((s, k) => { const x = taskOf(S, k); return s + (x ? x.pax : 0); }, 0);
  if (cur) {
    st.until = cur.end; st.start = cur.start; st.progress = (t - cur.start) / (cur.end - cur.start);
    if (cur.type === 'empty') { st.kind = 'empty'; st.label = 'Driving empty'; st.what = cur.from + ' → ' + cur.to + ' to pick up ' + ids(tids(curTrip)); }
    else if (cur.type === 'wait') { st.kind = 'wait'; st.label = 'Waiting for crew'; st.what = 'at ' + cur.at + ' for ' + ids(cur.waitingFor) + (cur.onboard.length ? ' · ' + ids(cur.onboard) + ' on board' : ''); }
    else if (cur.type === 'board') { st.kind = 'board'; st.label = 'Boarding'; st.what = ids(cur.tasks) + ' at ' + cur.at; }
    else if (cur.type === 'drive') { st.kind = 'drive'; st.label = 'Crew on board'; st.what = cur.from + ' → ' + cur.to + ' · ' + ids(cur.onboard) + ' · ' + pax(cur.onboard) + ' people'; }
    else if (cur.type === 'drop') { st.kind = 'drop'; st.label = 'Drop-off'; st.what = ids(cur.tasks) + ' at ' + cur.at; }
  } else if (out) { st.kind = 'out'; st.label = 'Out of service'; st.what = 'at ' + loc; }
  else if (t < src.shiftStart || t >= src.shiftEnd) { st.kind = 'off'; st.label = 'Off shift'; st.what = 'shift ' + src.shift; }
  if (out && !cur) st.next = null;
  return st;
}

export function taskNow(t, a, now) {
  const r = a.res, tr = a.trip, key = t.dir === 'DEP' ? r.doneAt : r.pickupAt;
  let s;
  if (now >= r.doneAt) s = { k: 'done', label: t.dir === 'DEP' ? 'At aircraft' : 'At Crew Center' };
  else if (now >= r.boardEnd) s = { k: 'onboard', label: 'On board' };
  else if (now >= r.boardStart) s = { k: 'boarding', label: 'Boarding' };
  else if (now >= tr.r.start) s = { k: 'enroute', label: 'Bus on the way' };
  else s = { k: 'planned', label: 'Planned' };
  s.key = key; s.slack = t.due - key; s.late = r.late;
  s.liveLate = r.late > 0 || (now > t.due && now < key);
  s.tight = !s.liveLate && s.slack <= 2 && s.k !== 'done';
  return s;
}

export { RULES, Engine };

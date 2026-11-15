import { Engine } from './engine.js';
import { AIRCRAFT, RULES } from './data.js';

export const fmt = Engine.fmt;
export const toMin = Engine.toMin;
export const drive = Engine.drive;

/* ---------- 1. Task generation: flight schedule + rules → crew transport tasks ---------- */
export function generateTasks(flights, R) {
  const out = [];
  flights.forEach((f) => {
    const ac = AIRCRAFT[f.aircraft], t = toMin(f.time), wide = ac.body === 'wide';
    const base = { flight: f.flight, stand: f.stand, aircraft: f.aircraft, sched: t, flightType: f.type };
    if (f.type === 'DEP') {
      const ready = t - R.depReadyBefore, due = t - R.depDueBefore;
      if (wide && R.splitWidebody) {
        out.push({ ...base, dir: 'DEP', crew: 'Cabin', pax: ac.cabin, from: 'Crew Center', to: f.area, ready, due });
        out.push({ ...base, dir: 'DEP', crew: 'Cockpit', pax: ac.cockpit, from: 'Crew Center', to: f.area, ready: ready + 5, due });
      } else {
        out.push({ ...base, dir: 'DEP', crew: 'Crew', pax: ac.cockpit + ac.cabin, from: 'Crew Center', to: f.area, ready, due });
      }
    } else {
      out.push({ ...base, dir: 'ARR', crew: wide ? 'Full crew' : 'Crew', pax: Math.min(RULES.capacity, ac.cockpit + ac.cabin), from: f.area, to: 'Crew Center', ready: t + R.arrReadyAfter, due: t + R.arrDueAfter });
    }
  });
  out.sort((a, b) => a.ready - b.ready || a.due - b.due || a.flight.localeCompare(b.flight));
  // stable IDs from the flight, so delays and re-sorting never mix up assignments
  out.forEach((x) => { x.id = x.flight.replace(' ', '') + (x.crew === 'Cockpit' ? '-CP' : x.crew === 'Cabin' ? '-CA' : ''); });
  return out;
}

export function prepareBuses(raw) {
  return raw.map((b) => { const [s, e] = b.shift.split('-'); return { ...b, shiftStart: toMin(s), shiftEnd: toMin(e), outFrom: null }; });
}

/* ---------- 2. Optimizer: automatic initial assignment, locked tasks stay on their bus ---------- */
export function optimize(tasks, buses, locks) {
  const plan = Engine.planCopilot(tasks, buses, locks || {});
  const assign = {};
  plan.buses.forEach((b) => b.trips.forEach((tr, i) => tr.tasks.forEach((t) => { assign[t.id] = { bus: b.id, grp: b.id + '#' + i + '#' + tr.tasks[0].id }; })));
  return assign;
}

/* ---------- 3. Evaluate any assignment (optimizer or manual) ---------- */
export function evaluate(tasks, buses, assign) {
  const byBus = {}, byTask = {}, conflicts = [];
  buses.forEach((b) => { byBus[b.id] = []; });
  const groups = {};
  tasks.forEach((t) => { const a = assign[t.id]; if (!a || !byBus[a.bus]) return; (groups[a.grp] = groups[a.grp] || { bus: a.bus, grp: a.grp, tasks: [] }).tasks.push(t); });
  Object.values(groups).forEach((g) => byBus[g.bus].push(g));
  buses.forEach((b) => {
    let loc = b.start, avail = b.shiftStart;
    byBus[b.id].sort((x, y) => Math.min(...x.tasks.map((t) => t.ready)) - Math.min(...y.tasks.map((t) => t.ready)));
    byBus[b.id].forEach((g) => {
      // a group must share a direction and pickup/drop point to ride together; otherwise split it
      const r = Engine.simTrip(loc, avail, g.tasks);
      g.r = r; loc = r.endLoc; avail = r.end;
      const pax = g.tasks.reduce((s, t) => s + t.pax, 0);
      if (pax > RULES.capacity) conflicts.push({ kind: 'capacity', bus: b.id, grp: g.grp, text: g.tasks.map((t) => t.id).join('+') + ' exceed ' + RULES.capacity + ' seats on ' + b.id });
      if (r.end > b.shiftEnd) conflicts.push({ kind: 'shift', bus: b.id, grp: g.grp, text: b.id + ' run ends after the driver’s shift (' + fmt(b.shiftEnd) + ')' });
      if (b.outFrom != null && r.end > b.outFrom) conflicts.push({ kind: 'out', bus: b.id, grp: g.grp, text: b.id + ' is out of service from ' + fmt(b.outFrom) + ' but still has ' + g.tasks.map((t) => t.id).join('+') });
      g.tasks.forEach((t) => { byTask[t.id] = { bus: b.id, grp: g.grp, run: g, res: r.tasks[t.id] }; });
    });
  });
  const m = { tasks: tasks.length, assigned: 0, open: 0, late: 0, lateMin: 0, empty: 0, drive: 0, busesUsed: 0, runs: 0 };
  tasks.forEach((t) => { const a = byTask[t.id]; if (!a) { m.open++; return; } m.assigned++; if (a.res.late > 0) { m.late++; m.lateMin += a.res.late; } });
  buses.forEach((b) => { if (byBus[b.id].length) m.busesUsed++; byBus[b.id].forEach((g) => { m.runs++; m.empty += g.r.empty; m.drive += g.r.drive; }); });
  m.km = m.drive * RULES.kmPerMin; m.emptyKm = m.empty * RULES.kmPerMin;
  return { byBus, byTask, conflicts, metrics: m };
}

/* ---------- 4. Task lifecycle on the clock ---------- */
export const STATUS = {
  open: { label: 'Unassigned', intent: 'danger' },
  planned: { label: 'Planned', intent: 'none' },
  sent: { label: 'Sent to driver', intent: 'warning' },
  confirmed: { label: 'Confirmed', intent: 'primary' },
  active: { label: 'In progress', intent: 'primary' },
  done: { label: 'Done', intent: 'success' }
};
/* Simulated driver confirmation delay for a task (0.5–4 min after it is sent), unless the driver tablet is used manually. */
export function autoConfirmDelay(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; return 0.5 + (h % 35) / 10; }

export function taskStatus(t, ev, now, confirmed, rules, manualBus) {
  const a = ev.byTask[t.id];
  if (!a) return 'open';
  const r = a.run.r;
  if (now >= a.res.doneAt) return 'done';
  if (now >= r.start) return 'active';
  const sentAt = r.start - rules.dispatchLead;
  if (now < sentAt) return 'planned';
  if (confirmed[t.id]) return 'confirmed';
  if (manualBus !== a.bus && now >= sentAt + autoConfirmDelay(t.id)) return 'confirmed';
  return 'sent';
}

/* ---------- 5. Exceptions: what the dispatcher must look at ---------- */
export function exceptions(tasks, ev, now, confirmed, rules, manualBus) {
  const out = [];
  tasks.forEach((t) => {
    const a = ev.byTask[t.id];
    if (!a) { if (t.due >= now - 5) out.push({ sev: 'critical', kind: 'open', task: t.id, text: t.id + ' · ' + t.flight + ' has no bus', sub: t.from + ' → ' + t.to + ' · ready ' + fmt(t.ready) }); return; }
    const st = taskStatus(t, ev, now, confirmed, rules, manualBus);
    if (st === 'done') return;
    if (a.res.late > 0) out.push({ sev: 'critical', kind: 'late', task: t.id, bus: a.bus, text: t.id + ' · ' + t.flight + ' will be ' + a.res.late + ' min late', sub: a.bus + ' · due ' + fmt(t.due) });
    if (st === 'sent' && now - (a.run.r.start - rules.dispatchLead) > 3) out.push({ sev: 'warning', kind: 'unconfirmed', task: t.id, bus: a.bus, text: a.bus + ' has not confirmed ' + t.id, sub: 'sent ' + fmt(a.run.r.start - rules.dispatchLead) + ' · bus leaves ' + fmt(a.run.r.start) });
  });
  ev.conflicts.forEach((c) => out.push({ sev: 'critical', kind: c.kind, bus: c.bus, grp: c.grp, text: c.text, sub: 'Conflict' }));
  return out.sort((x, y) => (x.sev === y.sev ? 0 : x.sev === 'critical' ? -1 : 1));
}

/* Locks for re-optimisation: everything already sent, confirmed or in progress stays on its bus. */
export function locksAt(tasks, ev, now, rules) {
  const locks = {};
  tasks.forEach((t) => { const a = ev.byTask[t.id]; if (a && now >= a.run.r.start - rules.dispatchLead) locks[t.id] = a.bus; });
  return locks;
}

export function realNow() { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
export function fmtSec(m) { const s = Math.floor(m * 60), h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60, se = s % 60; return [h, mi, se].map((x) => String(x).padStart(2, '0')).join(':'); }

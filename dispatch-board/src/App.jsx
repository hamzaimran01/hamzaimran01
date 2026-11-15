import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alignment, Button, Classes, Icon, Intent, Navbar, NavbarDivider, NavbarGroup, NavbarHeading, OverlayToaster, SegmentedControl, Switch, Tab, Tabs, Tag
} from '@blueprintjs/core';
import { DEFAULT_TASK_RULES, generateWorld, WINDOW } from './data.js';
import { evaluate, exceptions, fmt, fmtSec, generateTasks, locksAt, optimize, prepareBuses, realNow, toMin } from './model.js';
import Board from './views/Board.jsx';
import Flights from './views/Flights.jsx';
import Terminal from './views/Terminal.jsx';
import MapView from './views/MapView.jsx';
import Kpis from './views/Kpis.jsx';

export const Ctx = createContext(null);
export const useDb = () => useContext(Ctx);

let toasterP = null;
const toaster = () => toasterP || (toasterP = OverlayToaster.createAsync({ position: 'bottom-right', maxToasts: 3, className: 'db-toaster' }));

const VIEWS = [
  { id: 'board', label: 'Dispatch board', icon: 'gantt-chart' },
  { id: 'flights', label: 'Flights & rules', icon: 'airplane' },
  { id: 'terminal', label: 'Driver tablet', icon: 'mobile-phone' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'kpis', label: 'KPIs', icon: 'dashboard' }
];

function useDark() {
  const get = () => { const a = document.documentElement.getAttribute('data-theme'); return a ? a === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; };
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)'), on = () => setDark(get());
    mq.addEventListener('change', on);
    const mo = new MutationObserver(on); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', on); mo.disconnect(); };
  }, []);
  useEffect(() => { document.body.classList.toggle('bp6-dark', dark); }, [dark]);
}

export default function App() {
  useDark();
  const world = useMemo(() => generateWorld(), []);
  const [flights, setFlights] = useState(world.flights);
  const [rules, setRules] = useState(DEFAULT_TASK_RULES);
  const [buses, setBuses] = useState(() => prepareBuses(world.buses));
  const tasks = useMemo(() => generateTasks(flights, rules), [flights, rules]);
  const [assign, setAssign] = useState(() => optimize(generateTasks(world.flights, DEFAULT_TASK_RULES), prepareBuses(world.buses)));
  const ev = useMemo(() => evaluate(tasks, buses, assign), [tasks, buses, assign]);

  const [view, setView] = useState('board');
  const [clock, setClock] = useState({ t: 6 * 60 + 30, playing: false, speed: 10, real: false });
  const t = clock.real ? realNow() : clock.t;
  const [autoReplan, setAutoReplan] = useState(true);
  const [confirmed, setConfirmed] = useState({});
  const [manualBus, setManualBus] = useState(null);      // the bus whose tablet is driven by hand (no auto-confirm)
  const [messages, setMessages] = useState({});           // bus → [{at, from, text}]
  const [log, setLog] = useState([]);                     // dispatcher event log
  const [sel, setSel] = useState(null);                   // { kind: 'grp'|'task'|'bus', id }

  const hud = useCallback((message, intent = Intent.PRIMARY, icon = 'info-sign') => { toaster().then((x) => x.show({ message, intent, icon, timeout: 3500 })); }, []);
  const addLog = useCallback((text, icon = 'history') => setLog((l) => [{ at: clock.t, text, icon, id: Math.random() }, ...l].slice(0, 80)), [clock.t]);

  /* simulation clock */
  useEffect(() => {
    if (!(clock.playing || clock.real)) return undefined;
    let raf, last = performance.now(), lastSet = 0;
    const loop = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (now - lastSet > 50) {
        lastSet = now;
        setClock((c) => (c.real ? { ...c } : { ...c, t: Math.min(WINDOW.end, c.t + c.speed * ((now - (c._at || now)) / 1000 || dt) / 60), _at: now, playing: c.t < WINDOW.end }));
      }
      raf = requestAnimationFrame(loop);
    };
    setClock((c) => ({ ...c, _at: performance.now() }));
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clock.playing, clock.real]);

  /* re-plan. 'full': everything not yet sent to a driver is re-optimised.
     'minimal' (used for disruptions): only affected, late, unassigned or stranded jobs move; healthy jobs keep their bus. */
  const replan = useCallback((nextTasks = tasks, nextBuses = buses, why = 'Re-planned open work', mode = 'full', affected = []) => {
    const cur = evaluate(nextTasks, nextBuses, assign);
    const outBus = (id) => { const b = nextBuses.find((x) => x.id === id); return b && b.outFrom != null; };
    const locks = {};
    nextTasks.forEach((k) => {
      const a = cur.byTask[k.id];
      if (!a) return;
      const started = t >= a.run.r.start - rules.dispatchLead;
      if (started && !(outBus(a.bus) && t < a.run.r.start)) { locks[k.id] = a.bus; return; }
      if (mode === 'minimal' && !affected.includes(k.flight) && !a.res.late && !outBus(a.bus)) locks[k.id] = a.bus;
    });
    const hard = {}; // started jobs can never move
    nextTasks.forEach((k) => { const a = cur.byTask[k.id]; if (a && t >= a.run.r.start - rules.dispatchLead && !(outBus(a.bus) && t < a.run.r.start)) hard[k.id] = a.bus; });
    let next = optimize(nextTasks, nextBuses, locks), note = '';
    if (mode === 'minimal') {
      // release jobs that the minimal re-plan makes late, and try again (up to 3 rounds)
      for (let round = 0; round < 3; round++) {
        const e = evaluate(nextTasks, nextBuses, next);
        const lateIds = nextTasks.filter((k) => e.byTask[k.id] && e.byTask[k.id].res.late > 0 && locks[k.id] && !hard[k.id]).map((k) => k.id);
        if (!lateIds.length) break;
        lateIds.forEach((id) => { delete locks[id]; });
        // also free the other jobs on the buses where lateness appeared, so the optimizer has room
        const lateBuses = new Set(lateIds.map((id) => e.byTask[id].bus));
        nextTasks.forEach((k) => { const a = e.byTask[k.id]; if (a && lateBuses.has(a.bus) && !hard[k.id]) delete locks[k.id]; });
        next = optimize(nextTasks, nextBuses, locks);
      }
      const full = optimize(nextTasks, nextBuses, hard);
      const lm = evaluate(nextTasks, nextBuses, next).metrics.lateMin, lf = evaluate(nextTasks, nextBuses, full).metrics.lateMin;
      if (lm > lf + 10) { next = full; note = ' (larger re-plan needed to avoid late crews)'; }
    }
    const moved = nextTasks.filter((x) => (assign[x.id] && assign[x.id].bus) !== (next[x.id] && next[x.id].bus)).length;
    setAssign(next);
    addLog(why + ': ' + moved + ' job(s) moved to another bus' + note, 'automatic-updates');
    hud(why + ' · ' + moved + ' job(s) moved to another bus' + note, Intent.SUCCESS, 'automatic-updates');
  }, [tasks, buses, assign, t, rules, addLog, hud]);

  /* disruptions */
  const actions = {
    delayFlight: (flight, min) => {
      const nf = flights.map((f) => (f.flight === flight ? { ...f, time: fmt(toMin(f.time) + min), delayed: (f.delayed || 0) + min } : f));
      setFlights(nf); addLog(flight + ' delayed ' + min + ' min', 'time');
      if (autoReplan) setTimeout(() => replan(generateTasks(nf, rules), buses, flight + ' delayed ' + min + ' min', 'minimal', [flight]), 0);
      else hud(flight + ' delayed ' + min + ' min. Auto re-plan is off: check the exceptions.', Intent.WARNING, 'warning-sign');
    },
    breakdown: (busId) => {
      const nb = buses.map((b) => (b.id === busId ? { ...b, outFrom: Math.ceil(t) } : b));
      setBuses(nb); addLog(busId + ' out of service from ' + fmt(Math.ceil(t)), 'warning-sign');
      if (autoReplan) setTimeout(() => replan(tasks, nb, busId + ' out of service', 'minimal'), 0);
      else hud(busId + ' out of service. Its tasks are now conflicts.', Intent.DANGER, 'warning-sign');
    },
    repair: (busId) => { const nb = buses.map((b) => (b.id === busId ? { ...b, outFrom: null } : b)); setBuses(nb); addLog(busId + ' back in service', 'wrench'); },
    shortNotice: () => {
      const areas = ['Pier A', 'Pier B', 'Pier C', 'Pier Z', 'Apron V'];
      const area = areas[Math.floor(Math.random() * areas.length)];
      const std = Math.ceil(t) + 55, no = 'LH ' + (2000 + Math.floor(Math.random() * 900));
      const nf = flights.concat([{ flight: no, type: 'DEP', time: fmt(std), stand: area.replace('Pier ', '') + '9', area, aircraft: 'A320', added: true }]).sort((a, b) => a.time.localeCompare(b.time));
      setFlights(nf); addLog('Short-notice departure ' + no + ' (STD ' + fmt(std) + ') added', 'add');
      if (autoReplan) setTimeout(() => replan(generateTasks(nf, rules), buses, 'Short-notice ' + no, 'minimal', [no]), 0);
      else hud(no + ' added. Its crew task is unassigned.', Intent.WARNING, 'warning-sign');
    },
    move: (ids, busId) => {
      const grp = busId ? busId + '#m#' + ids[0] + '#' + Date.now() : null;
      setAssign((a) => { const n = { ...a }; ids.forEach((id) => { if (busId) n[id] = { bus: busId, grp }; else delete n[id]; }); return n; });
      addLog((busId ? 'Moved ' + ids.join('+') + ' to ' + busId : 'Unassigned ' + ids.join('+')) + ' (dispatcher)', busId ? 'drag-handle-horizontal' : 'remove');
      ids.forEach((id) => setConfirmed((c) => { const n = { ...c }; delete n[id]; return n; }));
      if (busId) setMessages((m) => ({ ...m, [busId]: [{ at: t, from: 'Dispatch', text: 'New job: ' + ids.join('+') }, ...(m[busId] || [])] }));
    },
    confirm: (id) => { setConfirmed((c) => ({ ...c, [id]: true })); addLog(id + ' confirmed by driver', 'tick'); },
    message: (busId, text, from = 'Dispatch') => setMessages((m) => ({ ...m, [busId]: [{ at: t, from, text }, ...(m[busId] || [])] })),
    incident: (busId, kind) => {
      addLog(busId + ' reports: ' + kind, 'issue');
      hud(busId + ' reports: ' + kind, kind === 'Vehicle defect' ? Intent.DANGER : Intent.WARNING, 'issue');
      if (kind === 'Vehicle defect') actions.breakdown(busId);
    },
    reset: () => { setFlights(world.flights); setRules(DEFAULT_TASK_RULES); const nb = prepareBuses(world.buses); setBuses(nb); setAssign(optimize(generateTasks(world.flights, DEFAULT_TASK_RULES), nb)); setConfirmed({}); setMessages({}); setLog([]); setSel(null); setClock((c) => ({ ...c, t: 390, playing: false })); hud('Day reset', Intent.SUCCESS, 'reset'); }
  };

  const exc = useMemo(() => exceptions(tasks, ev, t, confirmed, rules, manualBus), [tasks, ev, Math.floor(t * 4), confirmed, rules, manualBus]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = { flights, setFlights, rules, setRules, buses, tasks, assign, ev, t, clock, setClock, autoReplan, setAutoReplan, replan, actions, confirmed, manualBus, setManualBus, messages, log, sel, setSel, exc, setView, hud };

  return (
    <Ctx.Provider value={ctx}>
      <Navbar className="db-nav">
        <NavbarGroup align={Alignment.START}>
          <Icon icon="gantt-chart" intent={Intent.PRIMARY} size={20} className="db-logo" />
          <NavbarHeading className="db-brand"><b>Apron Dispatch Board</b><span className={Classes.TEXT_MUTED}>Crew bus real-time dispatching · prototype</span></NavbarHeading>
          <NavbarDivider className="hide-sm" />
          <Tabs id="views" selectedTabId={view} onChange={(v) => setView(String(v))} className="hide-sm">
            {VIEWS.map((v) => <Tab key={v.id} id={v.id} icon={v.icon} title={v.label} />)}
          </Tabs>
        </NavbarGroup>
        <NavbarGroup align={Alignment.END}>
          <span className="db-clock mono">{fmtSec(t)}</span>
          <Tag minimal intent={exc.some((e) => e.sev === 'critical') ? Intent.DANGER : Intent.SUCCESS} icon={exc.length ? 'warning-sign' : 'tick'} interactive onClick={() => setView('board')}>{exc.length} exception{exc.length === 1 ? '' : 's'}</Tag>
        </NavbarGroup>
      </Navbar>

      <div className="db-toolbar">
        <div className="row gap wrap">
          <Button icon="step-backward" onClick={() => setClock((c) => ({ ...c, t: Math.max(WINDOW.start, c.t - 15), real: false }))} aria-label="Back 15 minutes">−15</Button>
          <Button intent={Intent.PRIMARY} icon={clock.playing ? 'pause' : 'play'} onClick={() => setClock((c) => ({ ...c, playing: !c.playing, real: false }))} className="db-play">{clock.playing ? 'Pause' : 'Play'}</Button>
          <Button endIcon="step-forward" onClick={() => setClock((c) => ({ ...c, t: Math.min(WINDOW.end, c.t + 15), real: false }))} aria-label="Forward 15 minutes">+15</Button>
          <SegmentedControl size="small" value={String(clock.speed)} onValueChange={(v) => setClock((c) => ({ ...c, speed: +v }))} options={[1, 5, 10, 60].map((s) => ({ value: String(s), label: s + '×' }))} />
          <Switch checked={clock.real} label="Real clock" onChange={(e) => setClock((c) => ({ ...c, real: e.target.checked, playing: false }))} inline className="db-switch" />
        </div>
        <div className="row gap wrap">
          <Switch checked={autoReplan} label="Auto re-plan on disruptions" onChange={(e) => setAutoReplan(e.target.checked)} inline className="db-switch" />
          <Button icon="automatic-updates" intent={Intent.SUCCESS} onClick={() => replan(tasks, buses, 'Optimizer run')}>Optimize open work</Button>
          <Button icon="reset" variant="minimal" onClick={actions.reset}>Reset day</Button>
        </div>
      </div>

      <main className="db-main">
        {view === 'board' && <Board />}
        {view === 'flights' && <Flights />}
        {view === 'terminal' && <Terminal />}
        {view === 'map' && <MapView />}
        {view === 'kpis' && <Kpis />}
      </main>

      <Navbar className="db-tabbar">
        <div className="db-tabbar-in">
          {VIEWS.map((v) => <Button key={v.id} variant="minimal" icon={v.icon} active={view === v.id} intent={view === v.id ? Intent.PRIMARY : Intent.NONE} onClick={() => setView(v.id)}>{v.label.split(' ')[0]}</Button>)}
        </div>
      </Navbar>
      <footer className="db-foot">Synthetic data · planning view, not vehicle tracking · drivers shown as IDs only · no performance monitoring of drivers. Original prototype; not affiliated with any vendor.</footer>
    </Ctx.Provider>
  );
}

export { fmt };

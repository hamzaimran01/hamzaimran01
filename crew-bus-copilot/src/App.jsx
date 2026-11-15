import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alignment, Button, ButtonGroup, Card, CardList, Classes, Dialog, DialogBody, DialogFooter, H3, Icon, Intent, Menu, MenuItem, Navbar, NavbarDivider, NavbarGroup,
  NavbarHeading, NonIdealState, OverlayToaster, Popover, Switch, Tab, Tabs, Tag, KeyComboTag
} from '@blueprintjs/core';
import { Omnibar } from '@blueprintjs/select';
import { DATA_VERSION, FRA_FACTS, TOUR_CHAPTERS } from './data.js';
import {
  applyText, busOf, busOutLabel, clone, computePlans, fmt, freshScenario, liveRange, parsesClean, realNow, statusOf, taskOf, uniqFlights, shortList } from './logic.js';
import TasksPage from './pages/Tasks.jsx';
import PlanPage from './pages/Plan.jsx';
import LivePage from './pages/Live.jsx';
import ResultsPage from './pages/Results.jsx';
import Tour from './Tour.jsx';

const STORE = 'crewBusCopilot.v1';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
const loadS = () => { try { const s = JSON.parse(lsGet(STORE)); if (s && s.tasks && s.buses && s.version === DATA_VERSION) return s; } catch (e) { /* ignore */ } return null; };

let alertToasterP = null, hudToasterP = null;
const alertToaster = () => alertToasterP || (alertToasterP = OverlayToaster.createAsync({ position: 'bottom-right', maxToasts: 3, className: 'alert-toaster' }));
const hudToaster = () => hudToasterP || (hudToasterP = OverlayToaster.createAsync({ position: 'bottom', maxToasts: 1, className: 'hud-toaster' }));

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const PAGES = [
  { id: 'input', label: 'Tasks', icon: 'th-list' },
  { id: 'plan', label: 'Plan', icon: 'timeline-events' },
  { id: 'live', label: 'Live map', icon: 'map' },
  { id: 'overview', label: 'Results', icon: 'chart' }
];

function useDarkMode() {
  const get = () => {
    const a = document.documentElement.getAttribute('data-theme');
    if (a === 'dark') return true;
    if (a === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(get());
    mq.addEventListener('change', on);
    const mo = new MutationObserver(on); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', on); mo.disconnect(); };
  }, []);
  useEffect(() => { document.body.classList.toggle('bp6-dark', dark); }, [dark]);
  return dark;
}

export default function App() {
  useDarkMode();
  const [S, setS] = useState(() => loadS() || freshScenario());
  const [tab, setTabState] = useState(() => { const t = lsGet(STORE + '.tab'); return PAGES.some((p) => p.id === t) ? t : 'live'; });
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState('');
  const [parseOut, setParseOut] = useState(null);
  const [openOverrule, setOpenOverrule] = useState(null);
  const [flash, setFlash] = useState({ changed: [], accepted: null, n: 0 });
  const [live, setLive] = useState(() => ({ t: null, playing: false, speed: 10, mode: 'sim', source: 'copilot', view: lsGet(STORE + '.view') === 'cam' ? 'cam' : 'map', layers: { airport: true, routes: true, labels: true, pins: true }, now: realNow() }));
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [popups, setPopups] = useState(lsGet(STORE + '.popups') !== 'off');
  const [welcome, setWelcome] = useState(() => !lsGet(STORE + '.welcomed'));
  const [video, setVideo] = useState(false);
  const [omni, setOmni] = useState({ open: false, query: '' });
  const [tourOn, setTourOn] = useState(false);

  const { plan, base } = useMemo(() => computePlans(S), [S]);
  const livePlan = live.source === 'today' ? base : plan;
  const range = useMemo(() => liveRange(livePlan), [livePlan]);
  const liveT = live.mode === 'real' ? live.now : (live.t == null ? Math.min(Math.max(6 * 60 + 18, range[0]), range[1]) : live.t);

  useEffect(() => { lsSet(STORE, JSON.stringify(S)); }, [S]);
  useEffect(() => { if (live.t == null) setLive((l) => ({ ...l, t: Math.min(Math.max(6 * 60 + 18, range[0]), range[1]) })); }, [range, live.t]);
  // drop stale acceptances
  useEffect(() => {
    const stale = Object.keys(S.accepted).filter((k) => !plan.byTask[k] || plan.byTask[k].bus !== S.accepted[k]);
    if (stale.length) setS((s) => { const n = clone(s); stale.forEach((k) => delete n.accepted[k]); return n; });
  }, [plan, S.accepted]);

  const setTab = useCallback((t) => { setTabState(t); lsSet(STORE + '.tab', t); window.scrollTo(0, 0); }, []);

  /* ---------- hud & alerts ---------- */
  const hud = useCallback((message, intent = Intent.SUCCESS, icon = 'tick') => { hudToaster().then((t) => t.show({ message, intent, icon, timeout: 2400 }, 'hud')); }, []);
  const fired = useRef({});
  const quiet = useRef(true);
  const popupsRef = useRef(popups); popupsRef.current = popups;
  const seq = useRef(0);
  const lastPop = useRef(0);

  const viewAlert = useCallback((o) => { if (o.sel) { setSel(o.sel); setTabState('live'); } }, []);
  const pushAlert = useCallback((o) => {
    if (o.key) { if (fired.current[o.key]) return; fired.current[o.key] = 1; }
    const a = { ...o, id: ++seq.current };
    setAlerts((l) => [a, ...l].slice(0, 60));
    setUnread((u) => u + 1);
    const now = Date.now();
    if (popupsRef.current && !quiet.current && a.sev !== 'warning' && !/^(late|tight|na):today/.test(a.key || '') && (a.sev === 'info' || now - (lastPop.current || 0) > 2500)) {
      lastPop.current = now;
      alertToaster().then((t) => t.show({
        intent: a.sev === 'critical' ? Intent.DANGER : a.sev === 'warning' ? Intent.WARNING : Intent.PRIMARY,
        icon: a.sev === 'info' ? 'info-sign' : 'warning-sign',
        timeout: a.sev === 'critical' ? 10000 : 7000,
        message: (<div className="alert-msg"><div className="alert-title">{a.title}</div><div className="alert-body">{a.body}</div>{a.clock != null && <div className="alert-time">{fmt(a.clock)} · {a.sev === 'critical' ? 'Needs action' : a.sev === 'warning' ? 'Watch' : 'Update'}</div>}</div>),
        action: a.sel ? { text: 'View', onClick: () => viewAlert(a) } : undefined
      }));
    }
  }, [viewAlert]);

  const sigRef = useRef(''); const lastT = useRef(null);
  const resetLiveKeys = () => { Object.keys(fired.current).forEach((k) => { if (/^(late|tight|out|na):/.test(k)) delete fired.current[k]; }); };
  useEffect(() => {
    if (tab !== 'live') return;
    const t = liveT, p = livePlan, src = live.source;
    const sig = src + JSON.stringify(S.overrides) + S.log.length + S.tasks.length;
    if (sig !== sigRef.current) { sigRef.current = sig; resetLiveKeys(); }
    if (lastT.current != null && t < lastT.current - 0.5) resetLiveKeys();
    lastT.current = t;
    S.tasks.forEach((tk) => {
      const a = p.byTask[tk.id];
      if (!a) { pushAlert({ sev: 'critical', key: 'na:' + src + tk.id, title: tk.id + ' ' + tk.flight + ' has no bus', body: 'No bus can reach this crew within its shift. Bring a bus back into service or change the task.', sel: { kind: 'task', id: tk.id }, clock: t }); return; }
      const r = a.res, key = tk.dir === 'DEP' ? r.doneAt : r.pickupAt, slack = tk.due - key, lead = a.trip.r.start - t;
      if (t >= key) return;
      if (r.late > 0 && lead <= 10) pushAlert({ sev: 'critical', key: 'late:' + src + tk.id, clock: t, sel: { kind: 'task', id: tk.id }, title: tk.id + ' · ' + tk.flight + ' will be ' + r.late + ' min late', body: 'Bus ' + a.bus + ' gets the crew ' + (tk.dir === 'DEP' ? 'to the aircraft' : 'picked up') + ' at ' + fmt(key) + ', due ' + fmt(tk.due) + '.' });
      else if (r.late === 0 && slack <= 1 && lead <= 5) pushAlert({ sev: 'warning', key: 'tight:' + src + tk.id, clock: t, sel: { kind: 'task', id: tk.id }, title: tk.id + ' · ' + tk.flight + ': ' + (slack <= 0 ? 'no' : slack + ' min') + ' spare', body: 'Bus ' + a.bus + ' is on time, but any delay makes this crew late.' });
    });
    S.buses.forEach((b) => {
      if (b.outFrom != null && t >= b.outFrom) pushAlert({ sev: 'critical', key: 'out:' + b.id + ':' + b.outFrom, clock: Math.max(t, b.outFrom), sel: { kind: 'bus', id: b.id }, title: 'Bus ' + b.id + ' out of service', body: 'Its runs were moved to other buses in the plan.' });
    });
    quiet.current = false;
  }, [tab, Math.floor(liveT * 4), S, livePlan, live.source, pushAlert]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- live clock loop ---------- */
  const rangeRef = useRef(range); rangeRef.current = range;
  useEffect(() => {
    if (tab !== 'live' || !(live.playing || live.mode === 'real')) return undefined;
    let raf, last = performance.now(), lastSet = 0;
    const loop = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (now - lastSet > 40) {
        lastSet = now;
        setLive((l) => {
          if (l.mode === 'real') return { ...l, now: realNow() };
          const t = Math.min(rangeRef.current[1], (l.t || rangeRef.current[0]) + l.speed * ((now - (l._at || now)) / 1000 || dt) / 60);
          return { ...l, t, _at: now, playing: t < rangeRef.current[1] };
        });
      }
      raf = requestAnimationFrame(loop);
    };
    setLive((l) => ({ ...l, _at: performance.now() }));
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tab, live.playing, live.mode]);

  /* ---------- actions ---------- */
  const applyDisruption = useCallback((text) => {
    const r = applyText(S, text);
    if (!r) return null;
    setS(r.S); setParseOut(r);
    if (r.okText) {
      setFlash((f) => ({ changed: r.changed, accepted: null, n: f.n + 1 }));
      pushAlert({ sev: 'info', title: 'Plan updated: ' + r.okText, body: r.changed.length ? r.changed.length + ' crew tasks moved to a better bus: ' + shortList(r.changed) + '.' : 'No crew task had to change bus.', sel: r.changed.length ? { kind: 'task', id: r.changed[0] } : null, clock: live.mode === 'real' ? null : liveT });
    }
    return r;
  }, [S, pushAlert, live.mode, liveT]);

  const actions = useMemo(() => ({
    accept: (id) => { setS((s) => { const n = clone(s); n.accepted[id] = plan.byTask[id].bus; return n; }); setFlash((f) => ({ ...f, accepted: id, n: f.n + 1 })); hud(id + ' accepted'); },
    unaccept: (id) => setS((s) => { const n = clone(s); delete n.accepted[id]; return n; }),
    acceptAll: () => {
      let c = 0;
      setS((s) => { const n = clone(s); n.tasks.forEach((t) => { if (statusOf(s, plan, t.id) === 'open' && plan.byTask[t.id].res.late === 0) { n.accepted[t.id] = plan.byTask[t.id].bus; c++; } }); return n; });
      setTimeout(() => hud(c + ' proposal' + (c === 1 ? '' : 's') + ' accepted'), 0);
    },
    overrule: (id, bus) => { setS((s) => { const n = clone(s); n.overrideFrom[id] = n.overrideFrom[id] || plan.byTask[id].bus; n.overrides[id] = bus; delete n.accepted[id]; n.lastChange = null; return n; }); setOpenOverrule(null); hud(id + ' moved to ' + bus + '. Plan re-optimised.'); },
    revert: (id) => { setS((s) => { const n = clone(s); delete n.overrides[id]; delete n.overrideFrom[id]; return n; }); hud(id + ' is back on the copilot’s proposal'); },
    reset: () => { setS(freshScenario()); setSel(null); setParseOut(null); setDraft(''); hud('Back to the original sample day'); },
    undo: () => applyDisruption('undo')
  }), [plan, hud, applyDisruption]);

  const select = useCallback((kind, id, goto) => { setSel(kind ? { kind, id } : null); if (goto) { setTabState(goto); lsSet(STORE + '.tab', goto); } }, []);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (tourOn) return;
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOmni((o) => ({ open: !o.open, query: '' })); return; }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); setOmni({ open: true, query: '' }); }
      if (e.key === 'Escape' && sel) setSel(null);
      if (e.key === ' ' && tab === 'live' && live.mode === 'sim') { e.preventDefault(); setLive((l) => ({ ...l, playing: !l.playing })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourOn, sel, tab, live.mode]);

  const openCount = S.tasks.filter((t) => statusOf(S, plan, t.id) === 'open').length;

  const ctx = {
    S, setS, plan, base, tab, setTab, sel, select, draft, setDraft, parseOut, setParseOut, openOverrule, setOpenOverrule,
    flash, setFlash, live, setLive, liveT, livePlan, range, alerts, pushAlert, applyDisruption, actions, hud,
    setWelcome, setVideo, setOmni, tourOn, setTourOn, viewAlert, popups,
    setPopups: (v) => { setPopups(v); lsSet(STORE + '.popups', v ? 'on' : 'off'); },
    setView: (v) => { setLive((l) => ({ ...l, view: v })); lsSet(STORE + '.view', v); },
    _restore: (snap) => { setS(snap.S); setLive(snap.live); setTabState(snap.tab); setPopups(snap.popups); setSel(null); setAlerts([]); setUnread(0); fired.current = {}; },
    _quiet: quiet, _fired: fired, _clearAlerts: () => { setAlerts([]); setUnread(0); fired.current = {}; }
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <Navbar className="topbar">
          <NavbarGroup align={Alignment.START}>
            <Icon icon="drive-time" size={20} intent={Intent.PRIMARY} className="brand-icon" />
            <NavbarHeading className="brand">
              <span className="brand-title">Crew Bus Copilot</span>
              <span className={Classes.TEXT_MUTED + ' brand-sub'}>AI dispatch copilot · Frankfurt Airport</span>
            </NavbarHeading>
            <NavbarDivider className="hide-sm" />
            <Tabs id="pages" selectedTabId={tab} onChange={(t) => setTab(String(t))} className="page-tabs hide-sm" size="large">
              {PAGES.map((p) => (
                <Tab key={p.id} id={p.id} icon={p.icon} title={<span>{p.label}{p.id === 'plan' && openCount > 0 && <Tag round intent={Intent.DANGER} className="tab-badge">{openCount}</Tag>}{p.id === 'live' && <span className="live-dot" />}</span>} />
              ))}
            </Tabs>
          </NavbarGroup>
          <NavbarGroup align={Alignment.END}>
            <Button className="search-btn" variant="outlined" icon="search" onClick={() => setOmni({ open: true, query: '' })} endIcon={<span className="hide-md"><KeyComboTag combo="mod+k" minimal /></span>}><span className="hide-md">Search or type a disruption</span></Button>
            <Button className="tour-btn" intent={Intent.PRIMARY} variant="minimal" icon="play" onClick={() => setVideo(true)}><span className="hide-sm">Tour</span></Button>
            <AlertCenter alerts={alerts} unread={unread} onOpen={() => setUnread(0)} popups={popups} setPopups={ctx.setPopups} onView={viewAlert} onClear={() => { setAlerts([]); setUnread(0); }} />
            <Button variant="minimal" icon="help" aria-label="What is this?" onClick={() => setWelcome(true)} />
          </NavbarGroup>
        </Navbar>

        <main id={'view-' + tab} className="view enter" key={tab}>
          {tab === 'input' && <TasksPage />}
          {tab === 'plan' && <PlanPage />}
          {tab === 'live' && <LivePage />}
          {tab === 'overview' && <ResultsPage />}
        </main>

        <footer className="footer">
          <Tag intent={Intent.WARNING} minimal icon="shield" className="wc-note">Planning use only, no performance monitoring of drivers.</Tag>
          <span className={Classes.TEXT_MUTED}>Drivers appear only as pseudonymous IDs (D-01 …). Crew tasks and buses are synthetic; the airport map is schematic. Built with Palantir Blueprint.</span>
        </footer>

        <Navbar className="tabbar" aria-label="Pages">
          <ButtonGroup fill variant="minimal">
            {PAGES.map((p) => (
              <Button key={p.id} icon={p.icon} active={tab === p.id} intent={tab === p.id ? Intent.PRIMARY : Intent.NONE} onClick={() => setTab(p.id)} aria-current={tab === p.id}>
                {p.label}{p.id === 'plan' && openCount > 0 && <Tag round intent={Intent.DANGER} className="tab-badge">{openCount}</Tag>}
              </Button>
            ))}
          </ButtonGroup>
        </Navbar>

        <CommandBar omni={omni} setOmni={setOmni} />
        <WelcomeDialog isOpen={welcome && !tourOn} onClose={() => { setWelcome(false); lsSet(STORE + '.welcomed', '1'); }} />
        <VideoDialog isOpen={video && !tourOn} onClose={() => setVideo(false)} />
        <Tour />
      </div>
    </AppCtx.Provider>
  );
}

/* ---------- alert center ---------- */
function AlertCenter({ alerts, unread, onOpen, popups, setPopups, onView, onClear }) {
  const [open, setOpen] = useState(false);
  const content = (
    <div className="alert-panel">
      <div className="ap-head"><h4 className="bp6-heading">Alerts</h4><Switch checked={popups} label="Pop-ups" onChange={(e) => setPopups(e.target.checked)} inline /></div>
      {alerts.length ? (
        <Menu className="ap-list">
          {alerts.map((o) => (
            <MenuItem key={o.id} multiline icon={<Icon icon={o.sev === 'info' ? 'info-sign' : 'warning-sign'} intent={o.sev === 'critical' ? Intent.DANGER : o.sev === 'warning' ? Intent.WARNING : Intent.PRIMARY} />}
              text={<span className="ap-item"><span className="ap-title">{o.title}</span><span className="ap-text">{o.body}</span></span>}
              label={o.clock != null ? fmt(o.clock) : ''} onClick={() => { setOpen(false); onView(o); }} />
          ))}
        </Menu>
      ) : <NonIdealState icon="notifications" title="No alerts yet" description="Play the live map or add a disruption. Late risks, tight connections and breakdowns show up here." />}
      {alerts.length > 0 && <div className="ap-foot"><Button size="small" variant="minimal" icon="trash" onClick={onClear}>Clear all</Button></div>}
    </div>
  );
  return (
    <Popover content={content} placement="bottom-end" isOpen={open} onInteraction={(next) => { setOpen(next); if (next) onOpen(); }}>
      <Button variant="minimal" icon="notifications" aria-label="Alerts" className={'bell' + (unread ? ' has-unread' : '')}>
        {unread > 0 && <Tag round intent={Intent.DANGER} className="bell-count">{unread > 9 ? '9+' : unread}</Tag>}
      </Button>
    </Popover>
  );
}

/* ---------- command bar (Blueprint Omnibar) ---------- */
function CommandBar({ omni, setOmni }) {
  const app = useApp();
  const { S, setTab, select, applyDisruption, hud, setLive, setWelcome, setVideo, setTourOn } = app;
  const q = omni.query.trim(), ql = q.toLowerCase();
  const items = useMemo(() => {
    const out = [];
    if (q && parsesClean(q)) out.push({ icon: 'flash', title: 'Update plan: ' + q, sub: 'Apply this disruption and re-plan every bus', run: () => { const r = applyDisruption(q); if (r) hud(r.changed.length ? r.changed.length + ' task(s) moved to another bus' : 'Plan updated'); } });
    S.tasks.forEach((t) => { const hay = (t.id + ' ' + t.flight + ' ' + t.from + ' ' + t.to + ' ' + t.crew + ' ' + t.dir).toLowerCase(); if (!ql || hay.includes(ql)) out.push({ icon: 'person', title: t.id + ' · ' + t.flight + ' ' + t.dir, sub: t.crew + ', ' + t.pax + ' people · ' + t.from + ' → ' + t.to + ' · due ' + fmt(t.due), run: () => select('task', t.id, 'live') }); });
    uniqFlights(S).forEach((f) => { if (ql && f.toLowerCase().includes(ql)) out.push({ icon: 'airplane', title: 'Flight ' + f, sub: 'Show all crews of this flight', run: () => select('flight', f, 'live') }); });
    S.buses.forEach((b) => { if (!ql || b.id.toLowerCase().includes(ql) || 'bus'.startsWith(ql)) out.push({ icon: 'drive-time', title: 'Bus ' + b.id, sub: 'Starts at ' + b.start + ' · ' + (busOutLabel(b) || 'in service'), run: () => select('bus', b.id, 'live') }); });
    PAGES.forEach((p) => { if (!ql || p.label.toLowerCase().includes(ql)) out.push({ icon: p.icon, title: 'Go to ' + p.label, sub: 'Page', run: () => setTab(p.id) }); });
    [['Play or pause the replay', 'play', () => { setTab('live'); setLive((l) => ({ ...l, mode: 'sim', playing: !l.playing })); }],
     ['Watch the product tour (video)', 'video', () => setVideo(true)],
     ['Run the interactive product tour', 'presentation', () => setTourOn(true)],
     ['Open the airfield camera', 'video', () => { app.setView('cam'); setTab('live'); }],
     ['Show the introduction', 'help', () => setWelcome(true)]
    ].forEach(([title, icon, run]) => { if (!ql || title.toLowerCase().includes(ql)) out.push({ icon, title, sub: 'Action', run }); });
    return out.slice(0, 12);
  }, [q, ql, S]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Omnibar
      isOpen={omni.open}
      items={items}
      query={omni.query}
      onQueryChange={(query) => setOmni((o) => ({ ...o, query }))}
      itemListPredicate={(_, list) => list}
      onClose={() => setOmni({ open: false, query: '' })}
      onItemSelect={(it) => { setOmni({ open: false, query: '' }); it.run(); }}
      resetOnSelect
      inputProps={{ placeholder: 'Search tasks, flights, buses — or type “LH400 delayed 30 min”', className: 'omni-input' }}
      noResults={<MenuItem disabled text="No match. Try T03, LH400, B02, or “B03 broke down”." roleStructure="listoption" />}
      itemRenderer={(it, { handleClick, modifiers, index }) => (
        <MenuItem key={index} active={modifiers.active} icon={it.icon} onClick={handleClick} roleStructure="listoption"
          text={<span className="k-item"><span className="k-title">{it.title}</span><span className="k-sub">{it.sub}</span></span>} />
      )}
      overlayProps={{ className: 'omni-overlay' }}
    />
  );
}

/* ---------- welcome ---------- */
function WelcomeDialog({ isOpen, onClose }) {
  const { setTab, setVideo, setTourOn } = useApp();
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Crew Bus Copilot" icon="drive-time" className="welcome-dialog" canOutsideClickClose>
      <DialogBody>
        <H3>Getting crews to their aircraft on time</H3>
        <p className={Classes.INTENT_PRIMARY + ' tagline'}>The AI-first successor to call-by-call dispatch: the copilot plans every bus, the dispatcher stays in control.</p>
        <p className={Classes.RUNNING_TEXT}>Every day, dispatchers at Frankfurt send about 1,100 crew bus trips between the Crew Center and the aircraft, one phone call at a time. Crews arrive late, buses drive empty, and one late crew can delay a whole flight.</p>
        <Card interactive compact className="video-teaser" onClick={() => { onClose(); setVideo(true); }}>
          <Button intent={Intent.PRIMARY} icon="play" size="large" aria-label="Play the product tour" />
          <span><b>Watch the product tour</b><br /><span className={Classes.TEXT_MUTED}>About 80 seconds, step by step</span></span>
        </Card>
        <CardList compact className="steps">
          {[['Crew tasks', 'Each crew that needs a bus, and when. Type a disruption in plain words, like “LH400 delayed 30 min”.'],
            ['Copilot plan', 'The copilot proposes a bus for every crew and explains why. The dispatcher accepts or overrules it in seconds.'],
            ['Live map', 'Watch the buses move across the apron, get alerts before a crew is late, and select anything for details.'],
            ['Results', 'Today’s dispatching next to the copilot on the same day: crews on time, empty kilometres, buses used.']].map(([h, p], i) => (
            <Card key={h} className="step"><Tag round intent={Intent.PRIMARY}>{i + 1}</Tag><div><b>{h}</b><br /><span className={Classes.TEXT_MUTED}>{p}</span></div></Card>
          ))}
        </CardList>
        <div className="facts">
          {FRA_FACTS.items.slice(0, 2).concat(FRA_FACTS.brief).map((f) => <Card compact key={f.label} className="fact"><div className="fact-v">{f.value}</div><div className={Classes.TEXT_MUTED}>{f.label}</div></Card>)}
        </div>
        <p className={Classes.TEXT_MUTED}>Demo with synthetic crew data on a schematic map of the real airport. Drivers appear only as IDs (D-01…). Planning use only, no performance monitoring of drivers. Press <KeyComboTag combo="mod+k" minimal /> or <KeyComboTag combo="/" minimal /> to search or type a disruption anywhere.</p>
      </DialogBody>
      <DialogFooter actions={<>
        <Button size="large" variant="outlined" icon="map" onClick={() => { onClose(); setTab('live'); }}>Explore on my own</Button>
        <Button size="large" intent={Intent.PRIMARY} icon="presentation" onClick={() => { onClose(); setTourOn(true); }}>Take the interactive tour</Button>
      </>} />
    </Dialog>
  );
}

/* ---------- video ---------- */
function VideoDialog({ isOpen, onClose }) {
  const { setTourOn } = useApp();
  const ref = useRef(null);
  const seek = (t) => { const v = ref.current; if (v) { v.currentTime = t; v.play().catch(() => {}); } };
  return (
    <Dialog isOpen={isOpen} onClose={() => { if (ref.current) ref.current.pause(); onClose(); }} title="Crew Bus Copilot in 80 seconds" icon="video" className="video-dialog">
      <DialogBody>
        <div className="video-frame"><video ref={ref} id="tourVideo" src="tour.mp4" poster="tour-poster.jpg" controls playsInline preload="metadata" /></div>
        <div className="chapters">
          {TOUR_CHAPTERS.map((c, i) => (
            <Button key={c.t} size="small" variant="minimal" onClick={() => seek(c.t)} className="chapter">
              <span className={Classes.MONOSPACE_TEXT + " " + Classes.TEXT_MUTED}>{Math.floor(c.t / 60)}:{String(Math.floor(c.t % 60)).padStart(2, '0')}</span> {i ? i + '. ' : ''}{c.title}
            </Button>
          ))}
        </div>
      </DialogBody>
      <DialogFooter actions={<>
        <Button size="large" variant="outlined" onClick={onClose}>Close</Button>
        <Button size="large" intent={Intent.PRIMARY} icon="presentation" onClick={() => { if (ref.current) ref.current.pause(); onClose(); setTourOn(true); }}>Run it live in the app</Button>
      </>} />
    </Dialog>
  );
}

export { busOf, taskOf };

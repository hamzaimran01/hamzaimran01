import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Classes, H1, Icon, Intent, ProgressBar, Tag } from '@blueprintjs/core';
import { useApp } from './App.jsx';
import { freshScenario, statusOf } from './logic.js';

/* Pitch-style product tour that drives the real app. Each scene: caption + optional spotlight target + scripted actions. */
const SCENES = [
  { card: true, chapter: 'Intro', eyebrow: 'Crew Bus Copilot', title: 'Crew dispatch, planned in seconds', sub: 'An AI-first copilot for crew transport at Frankfurt Airport. About 1,100 crew bus trips a day, planned automatically instead of one phone call at a time.', dur: 7000 },
  { chapter: 'The problem', eyebrow: 'The problem', title: 'One phone call per trip', sub: 'Today, crews reach their aircraft late and buses drive empty. One late crew can delay a whole flight.', tab: 'overview', target: '#view-overview .compare', dur: 6500 },
  { chapter: 'Tasks', eyebrow: 'Step 1 · Tasks', title: 'Every crew in one list', sub: 'Who needs a bus, from where to where, and by when.', tab: 'input', target: '#view-input .tasks-table', dur: 5500 },
  { chapter: 'Disruptions', eyebrow: 'Step 2 · Disruptions', title: 'Just say what happened', sub: 'Type it the way you’d say it on the radio. The copilot re-plans every bus instantly.', tab: 'input', target: '#view-input .disrupt', dur: 4200,
    run: async (x) => { await x.wait(700); await x.type((v) => x.app.current.setDraft(v), 'LH400 delayed 30 min'); await x.wait(600); x.app.current.applyDisruption('LH400 delayed 30 min'); x.app.current.setDraft(''); } },
  { chapter: 'Plan', eyebrow: 'Step 3 · Plan', title: 'Every proposal explains itself', sub: 'Which bus, why the copilot chose it, and what the next-best option would cost.', tab: 'plan', target: '#view-plan .bus .assign', dur: 6500 },
  { chapter: 'Accept', eyebrow: 'Step 3 · Plan', title: 'Accept in one tap', sub: 'Or overrule it. The rest of the plan adapts around the dispatcher’s choice.', tab: 'plan', target: '#view-plan .bus .assign', dur: 4500,
    run: async (x) => { await x.wait(1600); const a = x.app.current; const first = a.S.tasks.map((t) => t.id).find((id) => statusOf(a.S, a.plan, id) === 'open' && document.querySelector('[data-accept="' + id + '"]')); const btn = document.querySelector('#view-plan [data-accept]'); const id = btn ? btn.getAttribute('data-accept') : first; if (id) a.actions.accept(id); } },
  { chapter: 'Live map', eyebrow: 'Step 4 · Live map', title: 'Watch the morning unfold', sub: 'Every bus moving across the apron, in sync with the plan.', tab: 'live', target: '.map-card', dur: 7500,
    pre: (a) => { a.setLive((l) => ({ ...l, view: 'map', mode: 'sim', source: 'copilot', t: 6 * 60 + 4, speed: 60, playing: false })); a.select(null); },
    run: async (x) => { await x.wait(500); x.app.current.setLive((l) => ({ ...l, playing: true })); } },
  { chapter: 'Drivers on duty', eyebrow: 'Step 4 · Live map', title: 'Who is on duty, at a glance', sub: 'Every driver as a pseudonymous avatar with their bus and what it is doing now. No names, no performance tracking.', tab: 'live', target: '.roster', dur: 5500 },
  { chapter: 'Details', eyebrow: 'Step 4 · Live map', title: 'Tap anything for details', sub: 'Bus, crew, flight or place, linked across map, timeline and table.', tab: 'live', target: '#lvInspector', dur: 6000,
    run: async (x) => { x.app.current.select('bus', 'B02'); } },
  { chapter: 'Alerts', eyebrow: 'Step 5 · Alerts', title: 'Problems surface before crews are late', sub: 'A bus breaks down: the copilot moves its crews and tells you who is at risk.', tab: 'live', target: '.search-btn', dur: 6500,
    run: async (x) => {
      const a = x.app.current; a.setPopups(true); a.setOmni({ open: true, query: '' }); await x.wait(500);
      await x.type((v) => x.app.current.setOmni({ open: true, query: v }), 'B05 out of service from 06:16'); await x.wait(700);
      x.app.current.setOmni({ open: false, query: '' }); x.app.current.applyDisruption('B05 out of service from 06:16'); await x.wait(700); x.setTarget('.alert-toaster');
    } },
  { chapter: 'Results', eyebrow: 'Step 6 · Results', title: 'Prove it in a shadow pilot', sub: 'The same day, two ways: crews on time, empty kilometres, buses used.', tab: 'overview', target: '#view-overview .hero-result', dur: 6500,
    pre: (a) => a.setLive((l) => ({ ...l, playing: false })) },
  { card: true, end: true, chapter: 'Summary', eyebrow: 'Crew Bus Copilot', title: 'Fewer late crews. Fewer empty kilometres.', sub: 'The dispatcher stays in control. Ready for a 90-day shadow pilot at Frankfurt.', dur: 7000 }
];

export default function Tour() {
  const app = useApp();
  const appRef = useRef(app); appRef.current = app;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false); pausedRef.current = paused;
  const tok = useRef(0), target = useRef(null), saved = useRef(null), spot = useRef(null), marks = useRef([]);

  const wait = (ms, my) => new Promise((res, rej) => {
    let left = ms, last = performance.now();
    const tick = () => {
      if (my !== tok.current) { rej('skip'); return; }
      const now = performance.now(); if (!pausedRef.current) left -= now - last; last = now;
      if (left <= 0) res(); else setTimeout(tick, 30);
    };
    tick();
  });
  const setTarget = (sel) => { target.current = sel; setTimeout(() => { const el = sel && document.querySelector(sel); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60); };

  const play = async (start) => {
    const my = ++tok.current;
    const x = { app: appRef, wait: (ms) => wait(ms, my), setTarget, type: async (setter, text) => { for (let i = 1; i <= text.length; i++) { setter(text.slice(0, i)); await wait(55, my); } } };
    try {
      for (let i = start; i < SCENES.length; i++) {
        const sc = SCENES[i];
        setIdx(i); marks.current[i] = performance.now(); target.current = null;
        if (sc.pre) sc.pre(appRef.current);
        if (sc.tab) appRef.current.setTab(sc.tab);
        await x.wait(400);
        if (sc.target) setTarget(sc.target);
        if (sc.run) await sc.run(x);
        await x.wait(sc.dur);
      }
      window.__tourDone = true;
    } catch (e) { if (e !== 'skip') throw e; }
  };

  // start / stop
  useEffect(() => {
    if (!app.tourOn) return undefined;
    const a = appRef.current;
    saved.current = { S: a.S, live: { ...a.live, playing: false }, tab: a.tab, popups: a.popups };
    window.__tourDone = false;
    a.setS(freshScenario()); a.select(null); a._clearAlerts(); a.setLive((l) => ({ ...l, playing: false, view: 'map' })); a.setPopups(false);
    document.body.classList.add('touring');
    setPaused(false);
    setTimeout(() => play(0), 50);
    // spotlight follow
    let raf;
    const follow = () => {
      const el = spot.current, sc = SCENES[Math.min(idxRef.current, SCENES.length - 1)];
      const t = !sc.card && target.current && document.querySelector(target.current);
      if (el) {
        if (t) { const r = t.getBoundingClientRect(), pad = 8; el.style.opacity = 1; el.style.transform = `translate(${r.left - pad}px,${r.top - pad}px)`; el.style.width = r.width + pad * 2 + 'px'; el.style.height = Math.min(r.height, window.innerHeight - 40) + pad * 2 + 'px'; }
        else el.style.opacity = 0;
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => { cancelAnimationFrame(raf); tok.current++; document.body.classList.remove('touring'); };
  }, [app.tourOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const idxRef = useRef(0); idxRef.current = idx;
  const end = (goto) => {
    tok.current++;
    const a = appRef.current, sv = saved.current;
    a.setOmni({ open: false, query: '' });
    if (sv) a._restore({ ...sv, tab: goto || sv.tab });
    a.setTourOn(false);
  };
  window.CrewTour = { start: () => appRef.current.setTourOn(true), scenes: SCENES, marks: marks.current };

  useEffect(() => {
    if (!app.tourOn) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') end();
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key === 'ArrowRight' && idxRef.current < SCENES.length - 1) play(idxRef.current + 1);
      else if (e.key === 'ArrowLeft' && idxRef.current > 0) play(idxRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [app.tourOn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!app.tourOn) return null;
  const sc = SCENES[idx];
  return (
    <div className={'tour' + (sc.card ? ' is-card' : '') + (paused ? ' paused' : '')}>
      <div className="tour-block" />
      <div className="tour-spot" ref={spot} />
      {sc.card && (
        <div className={'tour-card ' + Classes.DARK}>
          <div className="tc-in" key={idx}>
            <Icon icon="drive-time" size={56} intent={Intent.PRIMARY} />
            <Tag minimal size="large" round>{sc.eyebrow}</Tag>
            <H1>{sc.title}</H1>
            <p className={Classes.RUNNING_TEXT + ' ' + Classes.TEXT_LARGE}>{sc.sub}</p>
            {sc.end && <div className="row gap wrap tc-actions"><Button size="large" intent={Intent.PRIMARY} icon="map" onClick={() => end('live')}>Try it yourself</Button><Button size="large" variant="outlined" icon="refresh" onClick={() => play(0)}>Watch again</Button></div>}
          </div>
        </div>
      )}
      <Card elevation={4} className={'tour-bar' + (sc.card ? ' ' + Classes.DARK : '')} role="dialog" aria-label="Product tour" aria-live="polite">
        <ProgressBar value={(idx + 1) / SCENES.length} intent={Intent.PRIMARY} animate={!paused} stripes={!paused} className="tour-prog" />
        <div className="tour-row">
          <div className="tour-cap" key={idx}>{!sc.card ? <><Tag minimal intent={Intent.PRIMARY}>{sc.eyebrow}</Tag><div className="tour-title">{sc.title}</div><div className={Classes.TEXT_MUTED}>{sc.sub}</div></> : <span className={Classes.TEXT_MUTED}>Step {idx + 1} of {SCENES.length}</span>}</div>
          <div className="tour-ctl">
            <Button variant="minimal" icon="chevron-left" aria-label="Previous step" disabled={idx === 0} onClick={() => play(idx - 1)} />
            <Button variant="minimal" icon={paused ? 'play' : 'pause'} aria-label={paused ? 'Play' : 'Pause'} onClick={() => setPaused((p) => !p)} />
            <Button variant="minimal" icon="chevron-right" aria-label="Next step" disabled={idx === SCENES.length - 1} onClick={() => play(idx + 1)} />
            <Button variant="minimal" onClick={() => end()}>Exit tour</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

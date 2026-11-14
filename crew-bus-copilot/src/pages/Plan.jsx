import React, { useMemo, useState } from 'react';
import { Button, Callout, Card, Collapse, HTMLSelect, Intent, Tag } from '@blueprintjs/core';
import { useApp } from '../App.jsx';
import { busOf, busOutLabel, fmt, ids, overruleOptions, RULES, shortLoc, statusOf, tids, why } from '../logic.js';
import { BusChip, DirTag, Kpi, PageIntro } from '../ui.jsx';

export function Timeline({ trips, t0, t1, outFrom, now, curTrip, past }) {
  const span = t1 - t0;
  const pct = (x) => ((Math.min(Math.max(x, t0), t1) - t0) / span * 100).toFixed(2) + '%';
  const w = (a, b) => ((Math.min(b, t1) - Math.max(a, t0)) / span * 100).toFixed(2) + '%';
  const grid = [];
  for (let x = Math.ceil(t0 / 10) * 10; x <= t1; x += 10) grid.push(<i key={x} className="gl" style={{ left: pct(x) }} />);
  return (
    <div className="tl-track">
      {grid}
      {now != null && <div className="lv-pastshade" style={{ width: pct(now) }} />}
      {outFrom != null && <div className="seg seg-out" style={{ left: pct(outFrom || t0), width: w(outFrom || t0, t1) }} />}
      {trips.map((tr, ti) => tr.r.segs.filter((s) => s.end > s.start).map((s, si) => {
        const title = s.type === 'empty' ? 'Empty drive ' + s.from + ' → ' + s.to + ' (' + (s.end - s.start) + ' min)' : s.type === 'wait' ? 'Waiting at ' + s.at + ' for the crew' : ids(tids(tr)) + ': ' + tr.r.route.join(' → ') + ' ' + fmt(s.start) + '–' + fmt(s.end);
        const cls = 'seg seg-' + s.type + (tr.tasks[0].dir === 'ARR' && s.type === 'service' ? ' seg-arr' : '') + (tr.r.late > 0 && s.type === 'service' ? ' seg-late' : '') + (past && tr.r.end <= now ? ' seg-past' : '') + (curTrip === tr ? ' seg-cur' : '');
        return <div key={ti + '-' + si} className={cls} style={{ left: pct(s.start), width: w(s.start, s.end) }} title={title}>{s.type === 'service' && <span>{ids(tids(tr))}</span>}</div>;
      }))}
      {now != null && <div className="lv-now" style={{ left: pct(now) }} />}
    </div>
  );
}

function Overrule({ id }) {
  const { S, plan, actions, setOpenOverrule } = useApp();
  const opts = useMemo(() => overruleOptions(S, plan, id), [S, plan, id]);
  const first = opts.find((o) => o.ok);
  const [val, setVal] = useState(first ? first.bus : '');
  return (
    <Callout intent={Intent.WARNING} icon="swap-horizontal" compact className="overrule">
      <label className="small" htmlFor="ovSel">Give {id} to</label>{' '}
      <HTMLSelect id="ovSel" value={val} onChange={(e) => setVal(e.target.value)} options={opts.map((o) => ({ value: o.bus, label: o.label, disabled: !o.ok }))} />{' '}
      <Button size="small" intent={Intent.PRIMARY} disabled={!val} onClick={() => actions.overrule(id, val)}>Confirm</Button>{' '}
      <Button size="small" variant="minimal" onClick={() => setOpenOverrule(null)}>Cancel</Button>
      <div className="bp6-text-muted small">The rest of the plan is re-optimised around your choice. The numbers show the effect on the whole plan.</div>
    </Callout>
  );
}

export default function PlanPage() {
  const { S, plan, actions, openOverrule, setOpenOverrule, flash, select } = useApp();
  const [howto, setHowto] = useState(false);
  const m = plan.metrics, all = [];
  plan.buses.forEach((b) => b.trips.forEach((tr) => tr.r.segs.forEach((s) => all.push(s.start, s.end))));
  const t0 = Math.floor(((all.length ? Math.min(...all) : 360) - 5) / 10) * 10;
  const t1 = Math.ceil(((all.length ? Math.max(...all) : 420) + 5) / 10) * 10;
  const counts = { open: 0, accepted: 0, overruled: 0 };
  S.tasks.forEach((t) => { const s = statusOf(S, plan, t.id); if (counts[s] != null) counts[s]++; });
  const changed = (S.lastChange && S.lastChange.changed) || [];
  const ticks = [];
  for (let x = t0; x <= t1; x += 10) ticks.push(<span key={x} className="tick" style={{ left: ((x - t0) / (t1 - t0) * 100) + '%' }}>{fmt(x)}</span>);
  const total = S.tasks.length || 1;
  let n = 0;

  return (
    <>
      <PageIntro title="Copilot plan">
        The copilot proposes a bus for every crew and says why. Check each proposal and <b>Accept</b> it, or <b>Overrule</b> it and pick another bus; the rest of the plan adjusts around your choice.
      </PageIntro>
      {plan.unassigned.length > 0 && <Callout intent={Intent.DANGER} icon="error" className="mb">No bus can serve {plan.unassigned.join(', ')}. Check buses out of service or shift ends.</Callout>}
      <Card elevation={1} className="summary">
        <div className="kpis">
          <Kpi label="Crews on time" value={m.onTime} of={m.tasks} intent={m.lateTasks ? 'bad' : 'good'} />
          <Kpi label="Late minutes" value={m.lateMin} unit="min" intent={m.lateMin ? 'bad' : 'good'} />
          <Kpi label="Empty driving" value={m.empty} unit="min" tip="Minutes a bus drives with nobody on board, to reach its next crew. Less is better." />
          <Kpi label="Buses needed" value={m.busesUsed} of={S.buses.filter((b) => b.outFrom !== 0).length} />
        </div>
        <div className="decision-bar">
          <div className="dbars" aria-hidden="true"><span className="dbar ok" style={{ width: counts.accepted / total * 100 + '%' }} /><span className="dbar warn" style={{ width: counts.overruled / total * 100 + '%' }} /></div>
          <span className="small"><b>{counts.accepted}</b> accepted · <b>{counts.overruled}</b> overruled · <b>{counts.open}</b> to review</span>
          <Button intent={Intent.PRIMARY} icon="tick" disabled={!counts.open} onClick={actions.acceptAll}>Accept all on-time proposals</Button>
        </div>
        {S.lastChange && <Callout intent={Intent.PRIMARY} icon="exchange" compact className="changed-note">Last change: <span className="mono">{S.lastChange.text}</span>{changed.length ? '. Moved: ' + changed.join(', ') : ''}</Callout>}
        <Button variant="minimal" size="small" icon="manual" className="howto-btn" onClick={() => setHowto((h) => !h)} endIcon={howto ? 'chevron-up' : 'chevron-down'}>How to read this page</Button>
        <Collapse isOpen={howto}>
          <div className="legend small"><span><i className="lg lg-empty" />Driving empty</span><span><i className="lg lg-wait" />Waiting for crew</span><span><i className="lg lg-dep" />Crew to aircraft (DEP)</span><span><i className="lg lg-arr" />Crew back from aircraft (ARR)</span><span><i className="lg lg-late" />Late</span><span><i className="lg lg-out" />Out of service</span></div>
          <p className="bp6-text-muted small">Rule: crews ready within {RULES.shareWindow} min, going to stops at most {RULES.nearbyMax} min apart, may share a bus (max {RULES.capacity} seats, {RULES.maxStops} stops, nobody late). Each run goes to the bus with the lowest score: {RULES.latePenalty} × late minutes + empty minutes. Being late counts 40 times more than driving empty.</p>
        </Collapse>
      </Card>
      <div className="tl-axis-wrap"><div className="tl-axis">{ticks}</div></div>
      {plan.buses.map((b) => {
        const src = busOf(S, b.id), out = busOutLabel(src);
        const empty = b.trips.reduce((s, tr) => s + tr.r.empty, 0);
        return (
          <Card key={b.id} elevation={1} className="bus">
            <div className="bus-head">
              <div className="row gap wrap"><BusChip id={b.id} large intent={out ? Intent.DANGER : undefined} /><span className="bp6-text-muted small">Driver {b.driver} · starts at {b.start} · shift {src.shift}</span>{out && <Tag intent={Intent.DANGER} minimal>{out}</Tag>}</div>
              <div className="row gap"><span className="bp6-text-muted small">{b.trips.length} run(s) · {empty} min empty</span><Button size="small" variant="minimal" icon="map" onClick={() => select('bus', b.id, 'live')}>Show on map</Button></div>
            </div>
            <div className="tl"><Timeline trips={b.trips} t0={t0} t1={t1} outFrom={src.outFrom} /></div>
            {b.trips.length === 0 && <div className="assign idle bp6-text-muted small">{out ? out + '. No runs.' : 'No runs. Kept free as a reserve, which saves empty driving.'}</div>}
            {b.trips.map((tr) => tr.tasks.map((t) => {
              const a = plan.byTask[t.id], st = statusOf(S, plan, t.id), res = a.res;
              const times = t.dir === 'DEP' ? 'boards ' + fmt(res.pickupAt) + ' · at aircraft ' + fmt(res.doneAt) : 'picked up ' + fmt(res.pickupAt) + ' · at Crew Ctr ' + fmt(res.doneAt);
              const isChanged = changed.includes(t.id);
              return (
                <div key={t.id} className={'assign ' + (res.late ? 'is-late ' : '') + (isChanged ? 'is-changed ' : '') + (flash.changed.includes(t.id) ? 'flash ' : '') + 'st-' + st} style={{ '--i': n++ }}>
                  <div className="a-main">
                    <div className="a-head"><a role="button" className="mono strong" onClick={() => select('task', t.id, 'live')}>{t.id}</a> <span className="mono">{t.flight}</span> <DirTag dir={t.dir} />
                      <span className="bp6-text-muted">{t.crew} · {t.pax} people · {shortLoc(t.from)} → {shortLoc(t.to)}</span></div>
                    <div className="a-time"><span className="mono">{times}</span> <span className={'mono ' + (res.late ? 'bad' : 'bp6-text-muted')}>due {fmt(t.due)}{res.late ? ' · ' + res.late + ' min late' : ' · on time'}</span>
                      {isChanged && <Tag minimal intent={Intent.PRIMARY}>changed</Tag>}
                      {st === 'accepted' && <Tag intent={Intent.SUCCESS} minimal icon="tick" className={flash.accepted === t.id ? 'pop' : ''}>Accepted</Tag>}
                      {st === 'overruled' && <Tag intent={Intent.WARNING} minimal icon="swap-horizontal">Overruled → {a.bus}</Tag>}
                    </div>
                    <div className="why"><Tag minimal intent={Intent.PRIMARY} className="why-label">Why</Tag>{why(S, plan, t.id)}</div>
                    {openOverrule === t.id && <Overrule id={t.id} />}
                  </div>
                  <div className="a-actions">
                    {st === 'overruled' ? <Button size="small" variant="minimal" icon="undo" onClick={() => actions.revert(t.id)}>Back to copilot</Button>
                      : st === 'accepted' ? <><Button size="small" variant="minimal" onClick={() => actions.unaccept(t.id)}>Undo</Button><Button size="small" variant="outlined" onClick={() => setOpenOverrule(t.id)}>Overrule</Button></>
                        : <><Button size="small" intent={Intent.PRIMARY} icon="tick" data-accept={t.id} onClick={() => actions.accept(t.id)}>Accept</Button><Button size="small" variant="outlined" onClick={() => setOpenOverrule(t.id)}>Overrule</Button></>}
                  </div>
                </div>
              );
            }))}
          </Card>
        );
      })}
      <p className="wc-inline small">Planning use only, no performance monitoring of drivers.</p>
    </>
  );
}

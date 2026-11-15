import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Classes, CompoundTag, HTMLSelect, Icon, InputGroup, Intent, NonIdealState, Section, SectionCard, SegmentedControl, Tag } from '@blueprintjs/core';
import { useDb } from '../App.jsx';
import { WINDOW } from '../data.js';
import { fmt, STATUS, taskStatus } from '../model.js';

const LABEL = 168, ROW = 36;
const shortId = (id) => id.replace(/^LH/, '');

export default function Board() {
  const { tasks, buses, ev, t, confirmed, rules, manualBus, sel, setSel, actions, exc, replan, log } = useDb();
  const [ppm, setPpm] = useState(5);
  const [dropRow, setDropRow] = useState(null);
  const scroller = useRef(null);
  const W = (WINDOW.end - WINDOW.start) * ppm;
  const x = (m) => (Math.min(Math.max(m, WINDOW.start), WINDOW.end) - WINDOW.start) * ppm;
  const tq = Math.floor(t * 4) / 4;

  const status = useMemo(() => { const s = {}; tasks.forEach((k) => { s[k.id] = taskStatus(k, ev, tq, confirmed, rules, manualBus); }); return s; }, [tasks, ev, tq, confirmed, rules, manualBus]);
  const counts = useMemo(() => { const c = { open: 0, planned: 0, sent: 0, confirmed: 0, active: 0, done: 0 }; Object.values(status).forEach((v) => { c[v]++; }); return c; }, [status]);

  // unassigned lane: pack tasks into sub-rows so bars never overlap
  const pool = useMemo(() => {
    const open = tasks.filter((k) => !ev.byTask[k.id]).sort((a, b) => a.ready - b.ready);
    const lanes = [];
    open.forEach((k) => {
      const end = Math.max(k.due, k.ready + 40 / ppm) + 2;
      let lane = lanes.findIndex((l) => l < k.ready);
      if (lane < 0) { lanes.push(end); lane = lanes.length - 1; } else lanes[lane] = end;
      k._lane = lane;
    });
    return { open, n: Math.max(1, lanes.length) };
  }, [tasks, ev, ppm]);

  // scroll so "now" is in view on first show and when zoom changes
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = Math.max(0, x(t) - 260); }, [ppm]); // eslint-disable-line react-hooks/exhaustive-deps

  const ticks = [];
  for (let m = Math.ceil(WINDOW.start / 15) * 15; m <= WINDOW.end; m += 15) ticks.push(m);

  const onDrag = (e, ids) => { e.dataTransfer.setData('text/plain', JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'move'; };
  const onDrop = (e, busId) => { e.preventDefault(); setDropRow(null); try { const ids = JSON.parse(e.dataTransfer.getData('text/plain')); if (ids && ids.length) actions.move(ids, busId); } catch (err) { /* not a job */ } };
  const dropProps = (key, busId) => ({
    onDragOver: (e) => { e.preventDefault(); if (dropRow !== key) setDropRow(key); },
    onDragLeave: () => setDropRow((d) => (d === key ? null : d)),
    onDrop: (e) => onDrop(e, busId)
  });

  const selGrp = sel && sel.kind === 'grp' ? sel.id : null;
  const selTask = sel && sel.kind === 'task' ? sel.id : null;

  return (
    <div className="board">
      <div className="board-kpis">
        <CompoundTag leftContent="Jobs" round minimal>{tasks.length}</CompoundTag>
        <CompoundTag leftContent="Unassigned" intent={counts.open ? Intent.DANGER : Intent.NONE} round minimal={!counts.open}>{counts.open}</CompoundTag>
        <CompoundTag leftContent="Sent to driver" intent={Intent.WARNING} round minimal>{counts.sent}</CompoundTag>
        <CompoundTag leftContent="Confirmed" intent={Intent.PRIMARY} round minimal>{counts.confirmed}</CompoundTag>
        <CompoundTag leftContent="In progress" intent={Intent.PRIMARY} round>{counts.active}</CompoundTag>
        <CompoundTag leftContent="Done" intent={Intent.SUCCESS} round minimal>{counts.done}</CompoundTag>
        <CompoundTag leftContent="Late" intent={ev.metrics.late ? Intent.DANGER : Intent.SUCCESS} round minimal={!ev.metrics.late}>{ev.metrics.late}</CompoundTag>
        <CompoundTag leftContent="Buses in use" round minimal>{ev.metrics.busesUsed}/{buses.length}</CompoundTag>
        <span className="grow" />
        <span className={Classes.TEXT_MUTED}>Zoom</span>
        <SegmentedControl size="small" value={String(ppm)} onValueChange={(v) => setPpm(+v)} options={[{ value: '3', label: '5 h' }, { value: '5', label: '3 h' }, { value: '8', label: '2 h' }]} />
        <Button size="small" icon="locate" onClick={() => { const el = scroller.current; if (el) el.scrollTo({ left: Math.max(0, x(t) - 260), behavior: 'smooth' }); }}>Now</Button>
      </div>

      <div className="board-grid">
        <Section elevation={1} className="gantt-sec" icon="gantt-chart" title="Crew buses" subtitle="Drag a job onto another bus to re-assign it, or onto the unassigned lane to take it off a bus">
          <div className="gantt" ref={scroller}>
            <div className="gantt-in" style={{ width: LABEL + W }}>
              <div className="g-head" style={{ width: LABEL + W }}>
                <div className="g-label g-label-h">Bus · driver</div>
                <div className="g-axis" style={{ width: W }}>
                  {ticks.map((m) => <span key={m} className={'g-tick' + (m % 60 === 0 ? ' hour' : '')} style={{ left: x(m) }}>{m % 60 === 0 || ppm >= 5 ? fmt(m) : ''}</span>)}
                  <span className="g-nowtag mono" style={{ left: x(t) }}>{fmt(t)}</span>
                </div>
              </div>
              {buses.map((b) => {
                const runs = ev.byBus[b.id] || [];
                const out = b.outFrom != null && t >= b.outFrom;
                return (
                  <div key={b.id} className={'g-row' + (dropRow === b.id ? ' drop' : '') + (sel && sel.kind === 'bus' && sel.id === b.id ? ' is-sel' : '')} {...dropProps(b.id, b.id)}>
                    <div className="g-label" onClick={() => setSel({ kind: 'bus', id: b.id })}>
                      <span className={'g-dot' + (out ? ' out' : runs.some((g) => t >= g.r.start && t < g.r.end) ? ' busy' : '')} />
                      <b className="mono">{b.id}</b> <span className={Classes.TEXT_MUTED + ' mono'}>{b.driver}</span>
                      {b.outFrom != null && <Tag minimal intent={Intent.DANGER} className="g-out" htmlTitle={'Out of service from ' + fmt(b.outFrom)}>out</Tag>}
                    </div>
                    <div className="g-track" style={{ width: W }}>
                      {ticks.map((m) => <i key={m} className={'g-grid' + (m % 60 === 0 ? ' hour' : '')} style={{ left: x(m) }} />)}
                      <i className="g-shift" style={{ left: 0, width: x(b.shiftStart) }} />
                      <i className="g-shift" style={{ left: x(b.shiftEnd), width: Math.max(0, W - x(b.shiftEnd)) }} />
                      {b.outFrom != null && <i className="g-outzone" style={{ left: x(b.outFrom), width: Math.max(0, W - x(b.outFrom)) }} />}
                      {runs.map((g) => {
                        const r = g.r, ids = g.tasks.map((k) => k.id), st = status[ids[0]];
                        const svc = r.segs.find((s) => s.type === 'service'), emptyS = r.segs.find((s) => s.type === 'empty');
                        const late = r.late > 0, locked = st === 'active' || st === 'done';
                        return (
                          <React.Fragment key={g.grp}>
                            {emptyS && emptyS.end > emptyS.start && <i className="g-empty" style={{ left: x(emptyS.start), width: Math.max(2, x(emptyS.end) - x(emptyS.start)) }} title={'Empty drive ' + emptyS.from + ' → ' + emptyS.to} />}
                            <div className={'g-bar st-' + st + (late ? ' late' : '') + (selGrp === g.grp || ids.includes(selTask) ? ' sel' : '') + (g.tasks[0].dir === 'ARR' ? ' arr' : '')}
                              style={{ left: x(svc ? svc.start : r.start), width: Math.max(14, x(r.end) - x(svc ? svc.start : r.start)) }}
                              draggable={!locked} onDragStart={(e) => onDrag(e, ids)}
                              onClick={() => setSel({ kind: 'grp', id: g.grp })}
                              title={ids.join(' + ') + ' · ' + r.route.join(' → ') + ' · ' + fmt(svc ? svc.start : r.start) + '–' + fmt(r.end) + ' · ' + STATUS[st].label + (late ? ' · ' + r.late + ' min late' : '')}>
                              <span>{shortId(ids[0])}{ids.length > 1 ? ' +' + (ids.length - 1) : ''}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <i className="g-now" style={{ left: x(t) }} />
                    </div>
                  </div>
                );
              })}
              <div className={'g-row g-pool' + (dropRow === 'pool' ? ' drop' : '')} style={{ height: 10 + pool.n * 26 }} {...dropProps('pool', null)}>
                <div className="g-label"><Icon icon="inbox" size={14} /> <b>Unassigned</b> <Tag minimal round intent={pool.open.length ? Intent.DANGER : Intent.NONE}>{pool.open.length}</Tag></div>
                <div className="g-track" style={{ width: W }}>
                  {ticks.map((m) => <i key={m} className={'g-grid' + (m % 60 === 0 ? ' hour' : '')} style={{ left: x(m) }} />)}
                  {pool.open.map((k) => (
                    <div key={k.id} className={'g-bar st-open' + (selTask === k.id ? ' sel' : '') + (k.dir === 'ARR' ? ' arr' : '')} draggable onDragStart={(e) => onDrag(e, [k.id])}
                      onClick={() => setSel({ kind: 'task', id: k.id })} style={{ top: 5 + k._lane * 26, left: x(k.ready), width: Math.max(40, x(k.due) - x(k.ready)) }}
                      title={k.id + ' · ' + k.from + ' → ' + k.to + ' · ready ' + fmt(k.ready) + ', due ' + fmt(k.due)}>
                      <span>{shortId(k.id)}</span>
                    </div>
                  ))}
                  <i className="g-now" style={{ left: x(t) }} />
                </div>
              </div>
            </div>
          </div>
          <SectionCard className="g-legend">
            {['planned', 'sent', 'confirmed', 'active', 'done', 'open'].map((k) => <span key={k}><i className={'lg st-' + k} />{STATUS[k].label}</span>)}
            <span><i className="lg lg-arr" />Pick-up at aircraft (ARR)</span><span><i className="lg lg-late" />Late</span><span><i className="lg lg-empty" />Empty drive</span><span><i className="lg lg-shift" />Off shift</span>
          </SectionCard>
        </Section>

        <div className="side">
          <Details />
          <Section elevation={1} icon="warning-sign" title={'Exceptions (' + exc.length + ')'} subtitle="Manage by exception: everything else runs on plan" className="exc-sec"
            rightElement={exc.length ? <Button size="small" intent={Intent.SUCCESS} icon="automatic-updates" onClick={() => replan(undefined, undefined, 'Fix exceptions', 'minimal')}>Auto-fix</Button> : undefined}>
            <SectionCard className="exc-list">
              {exc.length ? exc.slice(0, 30).map((e, i) => (
                <Callout key={i} compact intent={e.sev === 'critical' ? Intent.DANGER : Intent.WARNING} icon={e.kind === 'open' ? 'inbox' : e.kind === 'unconfirmed' ? 'mobile-phone' : e.kind === 'late' ? 'time' : 'error'}
                  className="exc" onClick={() => setSel(e.task ? { kind: 'task', id: e.task } : { kind: 'bus', id: e.bus })}>
                  <b>{e.text}</b><div className={Classes.TEXT_MUTED}>{e.sub}</div>
                </Callout>
              )) : <NonIdealState icon="tick-circle" title="No exceptions" description="Every job has a bus, is on time and confirmed." layout="horizontal" />}
            </SectionCard>
          </Section>
          <Section elevation={1} icon="history" title="Event log" collapsible defaultIsOpen={false} compact>
            <SectionCard className="log-list">
              {log.length ? log.slice(0, 20).map((l) => <div key={l.id} className="log-row"><Icon icon={l.icon} size={12} /> <span className="mono">{fmt(l.at)}</span> {l.text}</div>) : <span className={Classes.TEXT_MUTED}>No events yet.</span>}
            </SectionCard>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Details() {
  const { tasks, buses, ev, t, sel, setSel, actions, confirmed, rules, manualBus, messages } = useDb();
  const [msg, setMsg] = useState('');
  if (!sel) return (
    <Section elevation={1} icon="properties" title="Details">
      <SectionCard><span className={Classes.TEXT_MUTED}>Click a job bar, a bus or an exception to see details and act on it.</span></SectionCard>
    </Section>
  );
  let list = [], bus = null;
  if (sel.kind === 'grp') { const any = Object.values(ev.byTask).find((a) => a.grp === sel.id); if (any) { list = any.run.tasks; bus = any.bus; } }
  if (sel.kind === 'task') { const k = tasks.find((x) => x.id === sel.id); if (k) { list = [k]; bus = ev.byTask[k.id] ? ev.byTask[k.id].bus : null; } }
  if (sel.kind === 'bus') bus = sel.id;
  const b = buses.find((x) => x.id === bus);
  const run = list.length && ev.byTask[list[0].id] ? ev.byTask[list[0].id].run : null;
  const ids = list.map((k) => k.id);
  return (
    <Section elevation={1} icon="properties" title={sel.kind === 'bus' ? 'Bus ' + bus : ids.join(' + ')} rightElement={<Button size="small" variant="minimal" icon="cross" onClick={() => setSel(null)} aria-label="Close" />}>
      <SectionCard className="details">
        {list.map((k) => {
          const st = taskStatus(k, ev, t, confirmed, rules, manualBus), a = ev.byTask[k.id];
          return (
            <div key={k.id} className="d-task">
              <div className="row gap wrap"><b className="mono">{k.id}</b><Tag minimal intent={k.dir === 'DEP' ? Intent.PRIMARY : Intent.SUCCESS}>{k.dir}</Tag><Tag minimal intent={STATUS[st].intent}>{STATUS[st].label}</Tag></div>
              <div>{k.crew} · {k.pax} crew · {k.aircraft} · stand {k.stand}</div>
              <div className={Classes.TEXT_MUTED}>{k.from} → {k.to} · {k.dir === 'DEP' ? 'STD' : 'STA'} {fmt(k.sched)} · ready {fmt(k.ready)} · due {fmt(k.due)}</div>
              {a && <div className={a.res.late ? 'bad' : ''}>{k.dir === 'DEP' ? 'At aircraft' : 'Picked up'} {fmt(k.dir === 'DEP' ? a.res.doneAt : a.res.pickupAt)}{a.res.late ? ' · ' + a.res.late + ' min late' : ''}</div>}
            </div>
          );
        })}
        {run && <div className={Classes.TEXT_MUTED}>Run {fmt(run.r.start)}–{fmt(run.r.end)} · {run.r.route.join(' → ')} · {run.r.empty} min empty</div>}
        {b && <div className="d-bus"><b className="mono">{b.id}</b> · driver {b.driver} · shift {b.shift} · starts at {b.start}{b.outFrom != null && <Tag minimal intent={Intent.DANGER} className="ml">out of service {fmt(b.outFrom)}</Tag>}</div>}
        {ids.length > 0 && (
          <div className="row gap wrap d-actions">
            <HTMLSelect value="" onChange={(e) => { if (e.target.value) { actions.move(ids, e.target.value); setSel({ kind: 'task', id: ids[0] }); } }}
              options={[{ value: '', label: bus ? 'Move to bus…' : 'Assign to bus…' }].concat(buses.filter((x) => x.id !== bus && !(x.outFrom != null && t >= x.outFrom)).map((x) => ({ value: x.id, label: x.id + ' · ' + x.driver })))} />
            {bus && <Button size="small" icon="remove" onClick={() => actions.move(ids, null)}>Unassign</Button>}
          </div>
        )}
        {b && (
          <>
            <div className="row gap d-actions">
              {b.outFrom == null ? <Button size="small" intent={Intent.DANGER} variant="outlined" icon="warning-sign" onClick={() => actions.breakdown(b.id)}>Report breakdown</Button>
                : <Button size="small" icon="wrench" onClick={() => actions.repair(b.id)}>Back in service</Button>}
            </div>
            <InputGroup size="small" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={'Message to ' + b.id + ' tablet…'} leftIcon="chat"
              onKeyDown={(e) => { if (e.key === 'Enter' && msg.trim()) { actions.message(b.id, msg.trim()); setMsg(''); } }}
              rightElement={<Button size="small" variant="minimal" icon="send-message" disabled={!msg.trim()} onClick={() => { actions.message(b.id, msg.trim()); setMsg(''); }} aria-label="Send" />} />
            {(messages[b.id] || []).slice(0, 3).map((m, i) => <div key={i} className={Classes.TEXT_MUTED + ' small'}><span className="mono">{fmt(m.at)}</span> {m.from}: {m.text}</div>)}
          </>
        )}
      </SectionCard>
    </Section>
  );
}

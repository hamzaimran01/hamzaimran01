import React, { memo, useMemo, useState } from 'react';
import { AnchorButton, Button, Callout, Card, Classes, CompoundTag, HTMLTable, InputGroup, Intent, NonIdealState, Section, SectionCard, SegmentedControl, Slider, Tag } from '@blueprintjs/core';
import { useApp } from '../App.jsx';
import { FraMap } from '../map.js';
import { busNow, busOf, fmt, fmtSec, ids, inMin, RULES, shortLoc, statusOf, taskNow, taskOf, tids, why } from '../logic.js';
import { BusChip, BusStateTag, DirTag, DriverAvatar, PageIntro, TaskStateTag } from '../ui.jsx';
import { Timeline } from './Plan.jsx';

const STORE = 'crewBusCopilot.v1';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };

/* ---------- map ---------- */
const StaticMap = memo(function StaticMap() {
  return <div className="map-static" dangerouslySetInnerHTML={{ __html: FraMap.staticSvg([]) }} />;
});

function MapOverlay({ p, t, selBus, onSelect }) {
  const { S } = useApp();
  const stationary = {}, items = [];
  p.buses.forEach((b) => {
    const st = busNow(S, b, t);
    let pos, moving = false;
    if (st.cur && (st.cur.type === 'empty' || st.cur.type === 'drive')) { pos = FraMap.along(st.cur.from, st.cur.to, st.progress); moving = true; }
    else pos = FraMap.node(st.cur ? st.cur.at : st.loc);
    if (!moving) { const k = Math.round(pos.x) + ',' + Math.round(pos.y); (stationary[k] = stationary[k] || []).push(b.id); }
    items.push({ b, st, pos, moving });
  });
  const routes = items.map(({ b, st, moving }) => {
    if (st.cur && moving) return <path key={b.id} className={'m-route ' + (st.cur.type === 'empty' ? 'r-empty' : 'r-crew') + (selBus === b.id ? ' r-sel' : '')} d={FraMap.pathD(st.cur.from, st.cur.to)} />;
    if (selBus === b.id && st.next) return <path key={b.id} className="m-route r-next" d={FraMap.pathD(st.loc, st.next.startLoc)} />;
    return null;
  });
  const waiting = {};
  S.tasks.forEach((tk) => { const a = p.byTask[tk.id]; if (a && t >= tk.ready && t < a.res.boardStart) (waiting[tk.from] = waiting[tk.from] || []).push(tk); });
  return (
    <svg className="fra-map map-overlay" viewBox="0 0 1000 600" aria-hidden="false">
      <g className="m-routes">{routes}</g>
      <g className="m-pins">
        {Object.keys(waiting).map((loc) => {
          const n = FraMap.node(loc), list = waiting[loc], pax = list.reduce((s, x) => s + x.pax, 0);
          const txt = list.length + ' crew' + (list.length > 1 ? 's' : '') + ' · ' + pax;
          return <g key={loc} className="m-pin" transform={`translate(${n.x} ${n.y - 34})`}><rect x={-(txt.length * 3.3 + 10)} y={-11} rx={9} height={20} width={txt.length * 6.6 + 20} /><text textAnchor="middle" y={3}>{txt}</text><path d="M-5 9 L0 15 L5 9 Z" /></g>;
        })}
      </g>
      <g>
        {items.map(({ b, st, pos, moving }) => {
          let { x, y } = pos;
          if (!moving) {
            const grp = stationary[Math.round(x) + ',' + Math.round(y)], i = grp.indexOf(b.id);
            if (grp.length > 1) { const ang = -Math.PI / 2 + i * (2 * Math.PI / grp.length); x += Math.cos(ang) * 20; y += Math.sin(ang) * 20; }
          }
          const label = b.id + (st.trip ? ' · ' + ids(tids(st.trip)) : st.kind === 'out' ? ' · out' : '');
          const cls = 'm-bus m-k-' + st.kind + (st.cur && st.cur.type === 'drive' && st.trip && st.trip.tasks[0].dir === 'ARR' ? ' m-arr' : '') + (selBus === b.id ? ' m-sel' : '') + (st.trip && st.trip.r.late ? ' m-late' : '');
          return (
            <g key={b.id} id={'mb-' + b.id} className={cls} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} role="button" tabIndex={0} aria-label={'Bus ' + b.id + ', ' + st.label}
              onPointerDown={(e) => { e.preventDefault(); onSelect('bus', b.id); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect('bus', b.id); } }}>
              <circle className="m-bus-pulse" r={12} /><circle className="m-bus-sel" r={17} /><circle className="m-bus-dot" r={12} />
              <text className="m-bus-num" y={4}>{b.id.slice(1)}</text>
              <g className="m-bus-tag m-lbl"><rect x={16} y={-10} rx={6} height={20} width={label.length * 6.6 + 14} /><text x={23} y={4}>{label}</text></g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ---------- airfield camera ---------- */
function ytId(u) {
  u = String(u || '').trim();
  const m = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(u) ? u : null);
}
function Camera() {
  const { hud } = useApp();
  const [id, setId] = useState(() => lsGet(STORE + '.cam') || '');
  const [val, setVal] = useState('');
  const dock = () => { const v = ytId(val); if (!v) { hud('That doesn’t look like a YouTube link. Paste the link of a live stream.', Intent.DANGER, 'error'); return; } lsSet(STORE + '.cam', v); setId(v); setVal(''); hud('Stream docked'); };
  const links = (
    <div className="row gap wrap cam-links">
      <AnchorButton intent={Intent.PRIMARY} icon="video" endIcon="share" href="https://www.youtube.com/results?search_query=frankfurt+airport+live&sp=EgJAAQ%253D%253D" target="_blank" rel="noopener">Live Frankfurt streams now</AnchorButton>
      <AnchorButton variant="outlined" endIcon="share" href="https://www.windfinder.com/webcams/frankfurt" target="_blank" rel="noopener">Weather webcams near FRA</AnchorButton>
    </div>
  );
  const dockRow = (
    <div className="cam-dock">
      <label className="small bp6-text-muted" htmlFor="camInput">Dock a stream here</label>
      <InputGroup id="camInput" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Paste a YouTube live link, e.g. https://www.youtube.com/watch?v=…" leftIcon="link"
        onKeyDown={(e) => { if (e.key === 'Enter') dock(); }}
        rightElement={<span className="row">{id && <Button variant="minimal" size="small" onClick={() => { lsSet(STORE + '.cam', ''); setId(''); }}>Remove</Button>}<Button intent={Intent.PRIMARY} size="small" onClick={dock}>Dock</Button></span>} />
    </div>
  );
  if (id) {
    return (
      <div className="cam">
        <div className="cam-frame">
          <iframe src={'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&mute=1&playsinline=1'} title="Live airfield camera" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          <div className="cam-fallback"><p>If the player stays dark, this page can’t embed outside video (shared links block it).</p><AnchorButton intent={Intent.PRIMARY} size="small" endIcon="share" href={'https://www.youtube.com/watch?v=' + id} target="_blank" rel="noopener">Open the stream on YouTube</AnchorButton></div>
        </div>
        <p className="bp6-text-muted small cam-note">Third-party stream. Not operated by Fraport or this tool; it can end at any time.</p>
        {links}{dockRow}
      </div>
    );
  }
  return (
    <div className="cam">
      <NonIdealState className="cam-empty" icon="video" title="See the airfield as it happens"
        description="Fraport has no official 24/7 public stream, but plane spotters broadcast live from the Frankfurt fence most days. Open the current streams, or dock one here so it sits next to your plan."
        action={links} />
      {dockRow}
      <p className="bp6-text-muted small cam-note">Streams are third-party and change daily. Shared links of this tool open them on YouTube; a local copy can play them inline.</p>
    </div>
  );
}

/* ---------- inspector ---------- */
function Inspector({ p, t }) {
  const { S, plan, sel, select, alerts, live, actions, setOpenOverrule, setTab, viewAlert } = useApp();
  const close = <Button variant="minimal" icon="cross" aria-label="Close details" onClick={() => select(null)} />;
  if (!sel) {
    return (
      <div className="ins-empty">
        <NonIdealState icon="select" title="Select something" description="Tap a bus on the map, a row in the timeline or a crew in the table to see its details here." layout="horizontal" />
        <h4 className="bp6-heading sub-h">Latest alerts</h4>
        {alerts.length ? alerts.slice(0, 4).map((o) => (
          <Callout key={o.id} compact intent={o.sev === 'critical' ? Intent.DANGER : o.sev === 'warning' ? Intent.WARNING : Intent.PRIMARY} icon={o.sev === 'info' ? 'info-sign' : 'warning-sign'} className="ins-alert" onClick={() => viewAlert(o)}>
            <b>{o.title}</b> <span className="bp6-text-muted mono small">{o.clock != null ? fmt(o.clock) : ''}</span>
          </Callout>
        )) : <p className="bp6-text-muted small">None yet. Press play to run the morning.</p>}
      </div>
    );
  }
  if (sel.kind === 'bus') {
    const b = p.buses.find((x) => x.id === sel.id); if (!b) return null;
    const st = busNow(S, b, t), src = busOf(S, b.id);
    return (
      <>
        <div className="ins-head"><div><div className="eyebrow">Bus</div><h3 className="ins-title bp6-heading mono">{b.id}</h3></div>{close}</div>
        <BusStateTag kind={st.kind} label={st.label} />
        <p className="ins-what">{st.what}{st.until != null && <><br /><span className="bp6-text-muted small">until {fmt(st.until)} ({inMin(st.until, t)})</span></>}</p>
        <dl className="ins-dl"><dt>Starts at</dt><dd>{b.start}</dd><dt>Shift</dt><dd className="mono">{src.shift}</dd><dt>Seats</dt><dd>{RULES.capacity}</dd><dt>Runs</dt><dd>{b.trips.length}</dd></dl>
        <h4 className="bp6-heading sub-h">Runs</h4>
        {b.trips.length ? <ul className="runs">{b.trips.map((tr, i) => {
          const state = tr.r.end <= t ? 'past' : tr.r.start <= t ? 'cur' : 'next';
          return <li key={i} className={'run run-' + state}><span className="mono">{fmt(tr.r.start)}</span><span><b className="mono">{ids(tids(tr))}</b> <span className="bp6-text-muted small">{tr.r.route.map(shortLoc).join(' → ')}</span></span>{tr.r.late ? <Tag minimal intent={Intent.DANGER}>{tr.r.late} late</Tag> : null}</li>;
        })}</ul> : <p className="bp6-text-muted small">No runs. Kept in reserve.</p>}
      </>
    );
  }
  if (sel.kind === 'task') {
    const tk = taskOf(S, sel.id); if (!tk) return null;
    const a = p.byTask[tk.id], s = a ? taskNow(tk, a, t) : null, stt = live.source === 'copilot' ? statusOf(S, plan, tk.id) : null;
    return (
      <>
        <div className="ins-head"><div><div className="eyebrow">Crew task</div><h3 className="ins-title bp6-heading"><span className="mono">{tk.id}</span> · {tk.flight} <DirTag dir={tk.dir} /></h3></div>{close}</div>
        {s ? <><TaskStateTag k={s.liveLate && s.k !== 'done' ? 'late' : s.k} label={s.label} />{s.tight && <Tag minimal intent={Intent.WARNING} className="ml">tight</Tag>}</> : <TaskStateTag k="late" label="No bus" />}
        <dl className="ins-dl"><dt>Crew</dt><dd>{tk.crew}, {tk.pax} people</dd><dt>Route</dt><dd>{tk.from} → {tk.to}</dd><dt>Ready</dt><dd className="mono">{fmt(tk.ready)}</dd><dt>Due</dt><dd className="mono">{fmt(tk.due)}</dd>
          {a && <><dt>Bus</dt><dd><a role="button" className="mono strong" onClick={() => select('bus', a.bus)}>{a.bus}</a></dd><dt>{tk.dir === 'DEP' ? 'At aircraft' : 'Picked up'}</dt><dd className="mono">{fmt(s.key)} · {s.late ? <span className="bad">{s.late} min late</span> : s.slack + ' min spare'}</dd></>}</dl>
        {live.source === 'copilot' && a && <>
          <div className="why"><Tag minimal intent={Intent.PRIMARY} className="why-label">Why</Tag>{why(S, plan, tk.id)}</div>
          <div className="row gap wrap ins-actions">
            {stt === 'open' && <Button size="small" intent={Intent.PRIMARY} icon="tick" onClick={() => actions.accept(tk.id)}>Accept</Button>}
            {stt === 'accepted' && <Tag intent={Intent.SUCCESS} minimal icon="tick">Accepted</Tag>}
            {stt === 'overruled' && <Tag intent={Intent.WARNING} minimal>Overruled</Tag>}
            <Button size="small" variant="outlined" onClick={() => { setOpenOverrule(tk.id); setTab('plan'); }}>Overrule in plan</Button>
            <Button size="small" variant="minimal" onClick={() => select('flight', tk.flight)}>All of {tk.flight}</Button>
          </div>
        </>}
      </>
    );
  }
  if (sel.kind === 'flight') {
    const list = S.tasks.filter((x) => x.flight === sel.id);
    return (
      <>
        <div className="ins-head"><div><div className="eyebrow">Flight</div><h3 className="ins-title bp6-heading mono">{sel.id}</h3></div>{close}</div>
        <ul className="runs">{list.map((x) => { const a = p.byTask[x.id], s = a ? taskNow(x, a, t) : null; return <li key={x.id} className="run"><a role="button" className="mono strong" onClick={() => select('task', x.id)}>{x.id}</a><span>{x.crew} · {x.pax} · {a ? a.bus : 'no bus'}</span>{s && <TaskStateTag k={s.k} label={s.label} />}</li>; })}</ul>
        <p className="bp6-text-muted small">Type “{sel.id} delayed 20 min” in the search bar to re-plan.</p>
      </>
    );
  }
  if (sel.kind === 'loc') {
    const here = S.tasks.filter((x) => x.from === sel.id || x.to === sel.id), n = FraMap.NODES[sel.id] || {};
    return (
      <>
        <div className="ins-head"><div><div className="eyebrow">Place</div><h3 className="ins-title bp6-heading">{sel.id}</h3></div>{close}</div>
        <p className="bp6-text-muted small">{n.sub}</p>
        <h4 className="bp6-heading sub-h">Crews starting or ending here</h4>
        <ul className="runs">{here.map((x) => <li key={x.id} className="run"><a role="button" className="mono strong" onClick={() => select('task', x.id)}>{x.id}</a><span>{x.flight} {x.dir} · ready {fmt(x.ready)}</span></li>)}</ul>
      </>
    );
  }
  return null;
}


/* ---------- drivers on duty (pseudonymous avatars) ---------- */
function DutyRoster({ p, t, selBus }) {
  const { S, select } = useApp();
  const rows = p.buses.map((b) => {
    const src = busOf(S, b.id), st = busNow(S, b, t);
    const out = src.outFrom === 0 || (src.outFrom != null && t >= src.outFrom);
    const onShift = t >= src.shiftStart && t < src.shiftEnd;
    return { b, src, st, group: out ? 'out' : onShift ? 'on' : 'off' };
  });
  const groups = [['on', 'On duty'], ['off', 'Not on shift now'], ['out', 'Bus out of service']];
  const onCount = rows.filter((r) => r.group === 'on').length;
  return (
    <Section elevation={1} className="sec roster" icon="people" title={'Drivers on duty (' + onCount + ' of ' + rows.length + ')'}
      subtitle="Pseudonymous driver IDs with their bus and what it is doing now. Planning use only, no performance monitoring of drivers."
      collapsible defaultIsOpen>
      <SectionCard>
        <div className="roster-groups">
          {groups.map(([g, label]) => {
            const list = rows.filter((r) => r.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="roster-group">
                <div className={Classes.TEXT_MUTED + ' roster-label'}>{label} · {list.length}</div>
                <div className="roster-list">
                  {list.map(({ b, src, st }) => (
                    <div key={b.id} className={'roster-item' + (selBus === b.id ? ' is-sel' : '')}>
                      <DriverAvatar driver={b.driver} status={g === 'out' ? 'out' : st.kind} selected={selBus === b.id} dim={g !== 'on'}
                        onClick={() => select('bus', b.id)}
                        title={b.driver + ' · bus ' + b.id + ' · shift ' + src.shift + ' · ' + st.label + (st.what ? ': ' + st.what : '')} />
                      <div className="roster-meta">
                        <div><b className={Classes.MONOSPACE_TEXT}>{b.driver}</b> <span className={Classes.TEXT_MUTED}>· {b.id}</span></div>
                        <BusStateTag kind={g === 'out' ? 'out' : st.kind} label={g === 'out' ? 'Out of service' : st.label} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </Section>
  );
}

/* ---------- page ---------- */
export default function LivePage() {
  const { S, plan, live, setLive, liveT: t, livePlan: p, range, sel, select, setView } = useApp();
  const selBus = sel && sel.kind === 'bus' ? sel.id : (sel && sel.kind === 'task' && p.byTask[sel.id] ? p.byTask[sel.id].bus : null);
  const selFlight = sel && sel.kind === 'flight' ? sel.id : null;
  const set = (patch) => setLive((l) => ({ ...l, ...patch }));
  const [r0, r1] = range;

  const rows = useMemo(() => S.tasks.slice().sort((a, b) => a.due - b.due || (a.id < b.id ? -1 : 1)), [S.tasks]);
  const counts = { planned: 0, enroute: 0, boarding: 0, onboard: 0, done: 0, late: 0 };
  const taskRows = rows.map((tk) => {
    const a = p.byTask[tk.id];
    if (!a) return { tk, a: null };
    const s = taskNow(tk, a, t); counts[s.k]++; if (s.liveLate) counts.late++;
    return { tk, a, s };
  });

  const ticks = [];
  for (let x = Math.ceil(r0 / 10) * 10; x <= r1; x += 10) ticks.push(<span key={x} className="tick" style={{ left: ((x - r0) / (r1 - r0) * 100) + '%' }}>{fmt(x)}</span>);
  const nowPct = ((Math.min(Math.max(t, r0), r1) - r0) / (r1 - r0) * 100) + '%';
  const layers = live.layers;

  return (
    <>
      <PageIntro title="Live map" right={
        <SegmentedControl value={live.source} onValueChange={(v) => set({ source: v })} options={[{ value: 'copilot', label: 'Copilot plan' }, { value: 'today', label: 'Today’s dispatching' }]} />
      }>Watch every crew bus move through the morning. The red line is “now”. Select a bus or a crew to see what it is doing, and get alerted when a crew is at risk of being late.</PageIntro>

      <Card elevation={2} className="lv-controls">
        <div className="lv-clock"><div className="lv-time mono">{fmtSec(t)}</div>
          <div className="small bp6-text-muted">{live.mode === 'real' ? (t < r0 || t > r1 ? 'Your clock is outside the sample morning (' + fmt(r0) + '–' + fmt(r1) + '). Switch to Replay to watch it.' : 'Following your device clock') : (live.playing ? 'Replaying at ' + live.speed + '× speed' : 'Paused. Press play or drag the slider.')}</div></div>
        <div className="lv-ctrl">
          {live.mode === 'sim' && (
            <div className="row gap wrap lv-play">
              <Button icon="step-backward" aria-label="Back 5 minutes" onClick={() => set({ t: Math.max(r0, t - 5) })}>−5</Button>
              <Button intent={Intent.PRIMARY} size="large" icon={live.playing ? 'pause' : 'play'} className="play-btn" onClick={() => set({ playing: !live.playing, t: !live.playing && t >= r1 ? r0 : t })}>{live.playing ? 'Pause' : t >= r1 ? 'Replay' : 'Play'}</Button>
              <Button endIcon="step-forward" aria-label="Forward 5 minutes" onClick={() => set({ t: Math.min(r1, t + 5) })}>+5</Button>
              <SegmentedControl size="small" value={String(live.speed)} onValueChange={(v) => set({ speed: +v })} options={[1, 10, 60].map((s) => ({ value: String(s), label: s + '×' }))} />
              <div className="slider-wrap"><Slider min={r0} max={r1} stepSize={0.25} labelStepSize={15} value={Math.min(Math.max(t, r0), r1)} onChange={(v) => set({ t: v })} labelRenderer={(v, o) => (o && o.isHandleTooltip ? fmt(v) : fmt(v))} /></div>
            </div>
          )}
          <SegmentedControl size="small" className="mode-ctl" value={live.mode} onValueChange={(v) => set({ mode: v, playing: false })} options={[{ value: 'sim', label: 'Replay sample day', icon: 'history' }, { value: 'real', label: 'Real clock', icon: 'time' }]} />
        </div>
      </Card>

      <div className="lv-counts">
        {[['planned', 'Planned'], ['enroute', 'Bus on the way'], ['boarding', 'Boarding'], ['onboard', 'On board'], ['done', 'Delivered'], ['late', 'Late']].map(([k, l]) => (
          <CompoundTag key={k} leftContent={l} intent={k === 'late' ? Intent.DANGER : k === 'done' ? Intent.SUCCESS : k === 'boarding' ? Intent.WARNING : k === 'planned' ? Intent.NONE : Intent.PRIMARY} minimal={k !== 'late' || !counts[k]} round>{counts[k]}</CompoundTag>
        ))}
      </div>

      <DutyRoster p={p} t={t} selBus={selBus} />

      <div className="lv-grid">
        <Section elevation={1} className="map-card" icon={live.view === 'cam' ? 'video' : 'map'}
          title={<span className="row gap"><Tag intent={Intent.DANGER} icon="record" className="live-badge">LIVE</Tag>{live.view === 'cam' ? 'Airfield camera' : 'Apron map'}</span>}
          subtitle={live.view === 'cam' ? 'Live video from plane spotters at the airfield' : 'Planned positions, not tracked vehicles · schematic, not to scale'}
          rightElement={<SegmentedControl size="small" value={live.view} onValueChange={setView} options={[{ value: 'map', label: 'Map', icon: 'map' }, { value: 'cam', label: 'Camera', icon: 'video' }]} />}>
          <SectionCard>
          {live.view === 'cam' ? <Camera /> : (
            <>
              <div className={'map-wrap' + Object.keys(layers).map((k) => (layers[k] ? '' : ' hide-' + k)).join('')}
                onClick={(e) => { const n = e.target.closest('[data-select]'); if (n) { const v = n.getAttribute('data-select'); select(v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)); } }}>
                <StaticMap />
                <MapOverlay p={p} t={t} selBus={selBus} onSelect={select} />
              </div>
              <div className="map-layers" role="group" aria-label="Map layers"><span className={Classes.TEXT_MUTED}>Layers</span>
                {[['airport', 'Airport', 'airplane'], ['routes', 'Routes', 'route'], ['labels', 'Labels', 'tag'], ['pins', 'Waiting crews', 'people']].map(([k, l, ic]) => (
                  <Button key={k} size="small" icon={ic} variant={layers[k] ? 'solid' : 'outlined'} intent={layers[k] ? Intent.PRIMARY : Intent.NONE} aria-pressed={layers[k]}
                    onClick={() => set({ layers: { ...layers, [k]: !layers[k] } })}>{l}</Button>
                ))}
              </div>
            </>
          )}
          </SectionCard>
        </Section>
        <div className="inspector" id="lvInspector"><Section elevation={1} title="Details" icon="properties"><SectionCard><Inspector p={p} t={t} /></SectionCard></Section></div>
      </div>

      <Section elevation={1} className="lv-board sec" title="Drivers and buses" icon="drive-time" subtitle="What each bus is doing now and what comes next">
        <SectionCard>
        <div className="lv-row lv-axisrow"><div className="lv-info small bp6-text-muted">Bus · driver</div><div className="lv-track"><div className="tl-axis">{ticks}<span className="lv-nowlabel mono" style={{ left: nowPct }}>{fmt(t)}</span></div></div></div>
        {p.buses.map((b) => {
          const st = busNow(S, b, t), src = busOf(S, b.id);
          return (
            <div key={b.id} className={'lv-row lvk-' + st.kind + (selBus === b.id ? ' is-sel' : '')} onClick={() => select('bus', b.id)}>
              <div className="lv-info">
                <div className="lv-id"><BusChip id={b.id} intent={st.kind === 'out' ? Intent.DANGER : undefined} /><span className="mono bp6-text-muted small">{b.driver}</span><BusStateTag kind={st.kind} label={st.label} /></div>
                <div className="lv-what">{st.what}{st.until != null && <span className="bp6-text-muted small"> · until {fmt(st.until)} ({inMin(st.until, t)})</span>}</div>
                {st.progress != null && <div className="lv-prog"><span style={{ width: Math.max(0, Math.min(1, st.progress)) * 100 + '%' }} /></div>}
                <div className="lv-next small">{st.next ? <>Next <b className="mono">{ids(tids(st.next))}</b> {st.next.tasks[0].flight} · leaves {shortLoc(st.next.startLoc)} {fmt(st.next.r.start)} <span className="bp6-text-muted">({inMin(st.next.r.start, t)})</span></> : <span className="bp6-text-muted">No more runs planned</span>}</div>
              </div>
              <div className="lv-track"><Timeline trips={b.trips} t0={r0} t1={r1} outFrom={src.outFrom} now={t} curTrip={st.trip} past /></div>
            </div>
          );
        })}
        </SectionCard>
      </Section>

      <Section elevation={1} className="sec" title="Crew tasks right now" icon="people" subtitle="Sorted by due time · ETA = at aircraft (DEP) or picked up (ARR)">
        <SectionCard padded={false}>
        <div className="table-wrap">
          <HTMLTable className="full-table lv-tbl" interactive compact>
            <thead><tr><th>Status</th><th>Task</th><th>Flight</th><th>Bus · driver</th><th>Route · people</th><th>Boards</th><th>ETA / due</th><th>Margin</th></tr></thead>
            <tbody>
              {taskRows.map(({ tk, a, s }) => {
                if (!a) return <tr key={tk.id} className="lv-late"><td><TaskStateTag k="late" label="No bus" /></td><td className="mono">{tk.id}</td><td className="mono">{tk.flight}</td><td colSpan={5} className="bad">No bus can do this</td></tr>;
                const dec = live.source === 'copilot' ? statusOf(S, plan, tk.id) : null;
                const isSel = (sel && sel.kind === 'task' && sel.id === tk.id) || selFlight === tk.flight || (sel && sel.kind === 'bus' && a.bus === selBus);
                return (
                  <tr key={tk.id} className={'lv-' + s.k + (s.liveLate ? ' lv-late' : '') + (isSel ? ' is-sel' : '')} onClick={() => select('task', tk.id)}>
                    <td><TaskStateTag k={s.liveLate && s.k !== 'done' ? 'late' : s.k} label={s.label} />{s.tight && <Tag minimal intent={Intent.WARNING} className="ml">tight</Tag>}</td>
                    <td className="mono strong">{tk.id}</td><td className="mono">{tk.flight} <DirTag dir={tk.dir} /></td>
                    <td className="mono"><b>{a.bus}</b> <span className="bp6-text-muted">{busOf(S, a.bus).driver}</span> {dec === 'accepted' ? <Tag minimal intent={Intent.SUCCESS} icon="tick" /> : dec === 'overruled' ? <Tag minimal intent={Intent.WARNING}>override</Tag> : dec === 'open' ? <Tag minimal>proposal</Tag> : null}</td>
                    <td>{shortLoc(tk.from)} → {shortLoc(tk.to)} <span className="bp6-text-muted small">{tk.pax}</span></td>
                    <td className="mono">{fmt(a.res.boardStart)}</td><td className="mono">{fmt(s.key)} <span className="bp6-text-muted">/ {fmt(tk.due)}</span></td>
                    <td className="mono small">{s.liveLate ? <span className="bad">{Math.max(s.late, Math.ceil(t - tk.due))} min late</span> : s.k === 'done' ? <span className="good">{s.slack} min early</span> : <span className={s.tight ? 'warn' : 'bp6-text-muted'}>{s.slack} min spare</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </HTMLTable>
        </div>
        </SectionCard>
      </Section>
      <p className={Classes.TEXT_MUTED + ' wc-inline'}>Planning use only, no performance monitoring of drivers. The map shows the plan, not tracked vehicle positions.</p>
    </>
  );
}

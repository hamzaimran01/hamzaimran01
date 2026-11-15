import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Card, Classes, Collapse, Intent, ProgressBar, Section, SectionCard, SegmentedControl, Tag } from '@blueprintjs/core';
import { useApp } from '../App.jsx';
import { busOf, fmt, RULES, shortLoc, why } from '../logic.js';
import { DirTag, DriverAvatar, PageIntro } from '../ui.jsx';

const RM = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Order in which the copilot allocates jobs: by ready time, then due time (same as the planning engine). */
function allocationOrder(tasks) {
  return tasks.slice().sort((a, b) => a.ready - b.ready || a.due - b.due || (a.id < b.id ? -1 : 1));
}

function JobCard({ t, active, id }) {
  return (
    <Card compact id={id} className={'job' + (active ? ' job-active' : '')} data-job={t.id}>
      <div className="job-top"><b className={Classes.MONOSPACE_TEXT}>{t.id}</b><DirTag dir={t.dir} /><span className={Classes.MONOSPACE_TEXT + ' job-time'}>{fmt(t.ready)}</span></div>
      <div className={Classes.TEXT_MUTED + ' job-route'}>{shortLoc(t.from)} → {shortLoc(t.to)} · {t.pax}</div>
    </Card>
  );
}

export default function AllocatePage() {
  const { S, plan, select, setTab } = useApp();
  const order = useMemo(() => allocationOrder(S.tasks), [S.tasks]);
  const [k, setK] = useState(0);              // jobs allocated so far
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('normal');
  const [flying, setFlying] = useState(null);  // id of the job in flight
  const [rules, setRules] = useState(false);
  const busy = useRef(false);

  // re-plan (disruption, override) → start over
  const sig = useMemo(() => order.map((t) => t.id + ':' + (plan.byTask[t.id] ? plan.byTask[t.id].bus : '-')).join(','), [order, plan]);
  useEffect(() => { setK(0); setPlaying(false); setFlying(null); busy.current = false; }, [sig]);

  const dur = speed === 'fast' ? 450 : speed === 'slow' ? 1500 : 850;
  const pause = speed === 'fast' ? 150 : speed === 'slow' ? 900 : 450;

  const allocateNext = () => {
    if (busy.current || k >= order.length) return;
    const t = order[k], a = plan.byTask[t.id];
    if (!a) { setK(k + 1); return; }
    const src = document.querySelector('[data-job="' + t.id + '"]');
    const dst = document.getElementById('slot-' + a.bus);
    if (!src || !dst || RM()) { setK(k + 1); return; }
    busy.current = true; setFlying(t.id);
    const r0 = src.getBoundingClientRect(), r1 = dst.getBoundingClientRect();
    const clone = src.cloneNode(true);
    clone.removeAttribute('id'); clone.removeAttribute('data-job');
    clone.classList.add('job-flyer');
    Object.assign(clone.style, { left: r0.left + 'px', top: r0.top + 'px', width: r0.width + 'px', height: r0.height + 'px' });
    document.body.appendChild(clone);
    const dx = r1.left - r0.left, dy = r1.top - r0.top, sc = Math.min(1, r1.height / r0.height);
    const anim = clone.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.04)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.2, offset: 1 }
    ], { duration: dur, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
    anim.onfinish = () => { clone.remove(); busy.current = false; setFlying(null); setK((x) => x + 1); };
  };

  // autoplay
  useEffect(() => {
    if (!playing) return undefined;
    if (k >= order.length) { setPlaying(false); return undefined; }
    if (flying) return undefined;
    const id = setTimeout(allocateNext, k === 0 ? 250 : pause);
    return () => clearTimeout(id);
  }, [playing, k, flying, order.length, pause]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = order.slice(0, k), open = order.slice(k);
  const last = k > 0 ? done[k - 1] : null;
  const current = flying ? order.find((t) => t.id === flying) : null;
  const explain = current || last;
  const ea = explain && plan.byTask[explain.id];

  return (
    <>
      <PageIntro title="Allocation" right={<Button icon="properties" variant="outlined" onClick={() => setRules((r) => !r)} endIcon={rules ? 'chevron-up' : 'chevron-down'}>Allocation rules</Button>}>
        Open jobs (offene Aufträge) wait at the bottom. Press <b>Allocate</b> and watch the copilot hand each one to a bus and driver at the top.
      </PageIntro>

      <Collapse isOpen={rules}>
        <Callout intent={Intent.PRIMARY} icon="properties" title="How the copilot picks a bus" className="sec">
          <ol className="rule-list">
            <li><b>Order:</b> jobs are handled by ready time, then due time.</li>
            <li><b>Fit:</b> the bus must be in service, on shift, and have enough seats (max {RULES.capacity}).</li>
            <li><b>Share when it is safe:</b> crews ready within {RULES.shareWindow} min, going to stops at most {RULES.nearbyMax} min apart, may ride together (max {RULES.maxStops} stops), only if nobody is late.</li>
            <li><b>Score:</b> {RULES.latePenalty} × late minutes + empty driving minutes. Lowest score wins; ties go to less driving, then a bus already in use.</li>
            <li><b>Human in the loop:</b> every allocation is a proposal. The dispatcher accepts or overrules it on the Plan page.</li>
          </ol>
        </Callout>
      </Collapse>

      <Card elevation={2} className="alloc-controls">
        <div className="row gap wrap">
          <Button intent={Intent.PRIMARY} size="large" icon={playing ? 'pause' : 'play'} disabled={k >= order.length && !playing} onClick={() => { if (!playing) { const el = document.querySelector('.alloc-controls'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } setPlaying((p) => !p); }}>
            {playing ? 'Pause' : k === 0 ? 'Allocate' : k >= order.length ? 'All allocated' : 'Continue'}
          </Button>
          <Button icon="step-forward" disabled={playing || !!flying || k >= order.length} onClick={allocateNext}>Next job</Button>
          <Button icon="fast-forward" variant="minimal" disabled={k >= order.length} onClick={() => { setPlaying(false); setK(order.length); }}>Allocate all</Button>
          <Button icon="reset" variant="minimal" disabled={k === 0} onClick={() => { setPlaying(false); setK(0); }}>Reset</Button>
          <SegmentedControl size="small" value={speed} onValueChange={setSpeed} options={[{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }]} />
        </div>
        <div className="alloc-progress">
          <ProgressBar value={order.length ? k / order.length : 0} intent={Intent.SUCCESS} stripes={playing} animate={playing} />
          <span className={Classes.TEXT_MUTED}><b>{k}</b> of {order.length} jobs allocated</span>
        </div>
        <div className="alloc-why" aria-live="polite">
          {explain && ea ? (
            <><Tag intent={Intent.PRIMARY} minimal>{current ? 'Allocating' : 'Last'}</Tag> <b className={Classes.MONOSPACE_TEXT}>{explain.id}</b> {explain.flight} → <b>{ea.bus}</b> ({busOf(S, ea.bus).driver}). <span className={Classes.TEXT_MUTED}>{why(S, plan, explain.id)}</span></>
          ) : <span className={Classes.TEXT_MUTED}>Ready. {order.length} open jobs, {plan.buses.length} buses. The copilot works through the list from the earliest ready time.</span>}
        </div>
      </Card>

      <Section elevation={1} className="sec lanes-sec" icon="people" title="Drivers and their jobs" subtitle="One lane per bus and driver (pseudonymous ID)">
        <SectionCard>
          <div className="lanes">
            {plan.buses.map((b) => {
              const src = busOf(S, b.id), out = src.outFrom === 0;
              const mine = done.filter((t) => plan.byTask[t.id] && plan.byTask[t.id].bus === b.id);
              const target = current && plan.byTask[current.id] && plan.byTask[current.id].bus === b.id;
              return (
                <div key={b.id} className={'lane' + (target ? ' lane-target' : '') + (out ? ' lane-out' : '')} onClick={() => select('bus', b.id)}>
                  <div className="lane-head">
                    <DriverAvatar driver={b.driver} size={30} dim={out} title={b.driver + ' · bus ' + b.id + ' · shift ' + src.shift} />
                    <div className="lane-name"><b className={Classes.MONOSPACE_TEXT}>{b.id}</b> <span className={Classes.TEXT_MUTED}>{b.driver} · {out ? 'out' : mine.length + (mine.length === 1 ? ' job' : ' jobs')}</span></div>
                  </div>
                  <div className="lane-jobs">
                    {mine.map((t) => {
                      const a = plan.byTask[t.id], shared = a.trip.tasks.length > 1;
                      return (
                        <Tag key={t.id} className={'lane-job' + (last && last.id === t.id ? ' landed' : '')} intent={t.dir === 'DEP' ? Intent.PRIMARY : Intent.SUCCESS} minimal={false}
                          htmlTitle={t.id + ' ' + t.flight + ' · ' + t.from + ' → ' + t.to + ' · ' + fmt(t.ready) + (shared ? ' · shares the bus' : '')}>
                          {t.id} · {fmt(a.res.pickupAt)}{shared ? ' ⇄' : ''}
                        </Tag>
                      );
                    })}
                    <span id={'slot-' + b.id} className="lane-slot" aria-hidden="true" />
                    {!mine.length && !target && <span className={Classes.TEXT_MUTED + ' small'}>{out ? 'Not available' : 'No jobs yet'}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </Section>

      <Section elevation={1} className="sec alloc-jobs" icon="inbox" title={'Open jobs (offene Aufträge) · ' + open.length}
        subtitle="Master list, in the order the copilot handles them"
        rightElement={k >= order.length ? <Button size="small" intent={Intent.PRIMARY} endIcon="arrow-right" onClick={() => setTab('plan')}>Review in Plan</Button> : undefined}>
        <SectionCard>
          {open.length ? (
            <div className="jobs">
              {open.map((t, i) => <JobCard key={t.id} t={t} active={i === 0 && !flying ? false : t.id === flying} />)}
            </div>
          ) : <Callout intent={Intent.SUCCESS} icon="tick-circle" title="All jobs allocated">Every open job has a proposed bus and driver. Review, accept or overrule them on the Plan page.</Callout>}
        </SectionCard>
      </Section>
      <p className={Classes.TEXT_MUTED + ' wc-inline'}>Planning use only, no performance monitoring of drivers. Synthetic data.</p>
    </>
  );
}

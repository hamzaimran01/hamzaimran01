import React, { useState } from 'react';
import { Button, Callout, Card, Classes, HTMLTable, Icon, Intent, Section, SectionCard, Tag } from '@blueprintjs/core';
import { useApp } from '../App.jsx';
import { FRA_FACTS } from '../data.js';
import { Engine, fmt, ids, RULES } from '../logic.js';
import { DirTag, PageIntro, Tip } from '../ui.jsx';

function MetricRow({ label, va, vb, na, nb, higherBetter, of, tip }) {
  const d = nb - na, good = higherBetter ? d > 0 : d < 0, bad = higherBetter ? d < 0 : d > 0;
  const pctTxt = na && !of ? ' (' + (d > 0 ? '+' : '') + Math.round(d / na * 100) + '%)' : '';
  const max = Math.max(na, nb, of || 0) || 1;
  const bar = (v, cls) => <div className="mbar"><span className={cls} style={{ width: (v / max * 100) + '%' }} /></div>;
  return (
    <tr>
      <th>{label} {tip && <Tip text={tip} />}</th>
      <td className="mono">{va}{bar(na, 'b-today')}</td>
      <td className="mono">{vb}{bar(nb, 'b-cop')}</td>
      <td className={'mono ' + (good ? 'good' : bad ? 'bad' : 'bp6-text-muted')}>{d === 0 ? 'same' : (d > 0 ? '+' : '') + d + pctTxt}</td>
    </tr>
  );
}

export default function ResultsPage() {
  const { S, plan, base } = useApp();
  const a = base.metrics, b = plan.metrics;
  const pure = Engine.planCopilot(S.tasks, S.buses, {}).metrics, nOv = Object.keys(S.overrides).length;
  const emptyCut = a.empty ? Math.round((a.empty - b.empty) / a.empty * 100) : 0;
  const [showAll, setShowAll] = useState(false);

  return (
    <>
      <PageIntro title="Results">
        The same morning planned two ways: by today’s dispatchers, call by call, and by the copilot. This is the comparison the head of operations needs before deciding on go-live after the 90-day shadow pilot.
      </PageIntro>
      <Callout intent={Intent.PRIMARY} icon="chart" className="hero-result sec" title="The same morning, two ways">
        <p className="headline">
          With the copilot, <b>{b.onTime} of {b.tasks}</b> crews arrive on time (today: {a.onTime}), with{' '}
          {emptyCut > 0 ? <b>{emptyCut}% less empty driving</b> : emptyCut < 0 ? <b>{-emptyCut}% more empty driving</b> : 'the same empty driving'}
          {b.busesUsed === a.busesUsed ? <>, using the same {b.busesUsed} buses.</> : <> and <b>{b.busesUsed}</b> buses instead of {a.busesUsed}.</>}
        </p>
        <p className={Classes.TEXT_MUTED}>{S.log.length ? 'Includes your disruptions: ' + S.log.map((l) => l.text).join('; ') + '.' : 'Original sample day, no disruptions.'} Both columns use the same driving times, boarding ({RULES.boarding} min) and drop-off ({RULES.dropoff} min). Kilometres assume {Math.round(RULES.kmPerMin * 60)} km/h on the apron.</p>
      </Callout>
      <Section title="Today’s dispatching vs copilot" icon="comparison" elevation={1} className="sec">
        <SectionCard padded={false}>
        <div className="table-wrap">
          <HTMLTable className="full-table compare" compact>
            <thead><tr><th /><th>Today’s dispatching<div className="bp6-text-muted small">one run per phone call</div></th><th>Copilot<div className="bp6-text-muted small">including your overrides</div></th><th>Difference</th></tr></thead>
            <tbody>
              <MetricRow label="Crews on time" va={a.onTime + ' / ' + a.tasks} vb={b.onTime + ' / ' + b.tasks} na={a.onTime} nb={b.onTime} higherBetter of={a.tasks} />
              <MetricRow label="Crew members on time" va={a.paxOnTime + ' / ' + a.pax} vb={b.paxOnTime + ' / ' + b.pax} na={a.paxOnTime} nb={b.paxOnTime} higherBetter of={a.pax} />
              <MetricRow label="Late minutes" va={a.lateMin} vb={b.lateMin} na={a.lateMin} nb={b.lateMin} />
              <MetricRow label="Empty driving" va={a.empty + ' min · ' + a.emptyKm.toFixed(1) + ' km'} vb={b.empty + ' min · ' + b.emptyKm.toFixed(1) + ' km'} na={a.empty} nb={b.empty} tip="Minutes a bus drives with nobody on board." />
              <MetricRow label="Total driving" va={a.drive + ' min · ' + a.km.toFixed(1) + ' km'} vb={b.drive + ' min · ' + b.km.toFixed(1) + ' km'} na={a.drive} nb={b.drive} />
              <MetricRow label="Buses used" va={a.busesUsed} vb={b.busesUsed} na={a.busesUsed} nb={b.busesUsed} />
              <MetricRow label="Bus runs" va={a.trips} vb={b.trips} na={a.trips} nb={b.trips} />
              <tr><th>Overrides <Tip text="How often dispatchers overruled the copilot. A falling rate means growing trust." /></th><td className="mono">n/a<div className="bp6-text-muted small">nothing to overrule</div></td>
                <td className="mono">{nOv} <span className="bp6-text-muted small">({b.tasks ? Math.round(nOv / b.tasks * 100) : 0}% of tasks)</span></td>
                <td className="bp6-text-muted small">{nOv ? 'Without overrides: ' + pure.lateMin + ' late min, ' + pure.empty + ' empty min' : 'Plan as proposed'}</td></tr>
            </tbody>
          </HTMLTable>
        </div>
        {Object.keys(base.reassigned).length > 0 && <p className={Classes.TEXT_MUTED + " pad"}>Today’s column: {Object.keys(base.reassigned).map((k) => k + ' → ' + base.reassigned[k]).join(', ')} had no usable bus on record (added task or bus out of service), so they went to the first bus able to reach the pickup.</p>}
        </SectionCard>
      </Section>
      <div className="grid-2">
        <Section title="90-day shadow pilot" icon="endorsed" elevation={1} className="sec">
          <SectionCard>
            <p className="small">The copilot runs next to the dispatchers. They keep deciding; every accept and overrule is counted. Example go-live criteria, to be agreed with operations and the works council:</p>
            <ul className="small checklist">
              {['Crews on time: copilot at least as good as today on most days, including disrupted ones', 'Empty kilometres and buses used: a clear, steady reduction', 'Override rate falling, with the reasons reviewed weekly'].map((x) => <li key={x}><Icon icon="tick-circle" intent={Intent.SUCCESS} size={14} />{x}</li>)}
            </ul>
          </SectionCard>
        </Section>
        <Section title="Frankfurt Airport in numbers" icon="airplane" elevation={1} className="sec">
          <SectionCard>
            <div className="facts">
              {FRA_FACTS.items.concat(FRA_FACTS.brief).map((f) => <Card compact className="fact" key={f.label}><div className="fact-v">{f.value}</div><div>{f.label}</div><div className={Classes.TEXT_MUTED}>{f.note}</div></Card>)}
            </div>
            <p className="bp6-text-muted small">Sources: {FRA_FACTS.sources.map((s, i) => <React.Fragment key={s.url}>{i ? ' · ' : ''}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></React.Fragment>)}. Crew tasks, buses and driving times in this demo are synthetic.</p>
          </SectionCard>
        </Section>
      </div>
      <Section title="Task by task" icon="th" elevation={1} className="sec">
        <SectionCard padded={false}>
          <div className="table-wrap">
            <HTMLTable className="full-table" compact striped>
              <thead>
                <tr><th rowSpan={2}>Task</th><th rowSpan={2}>Flight</th><th rowSpan={2}>Type</th><th rowSpan={2}>Due</th><th colSpan={3} className="grp">Today’s dispatching</th><th colSpan={3} className="grp">Copilot</th></tr>
                <tr><th>Bus</th><th>Time</th><th>Late</th><th>Bus</th><th>Time</th><th>Late</th></tr>
              </thead>
              <tbody>
                {S.tasks.slice().sort((x, y) => x.ready - y.ready || (x.id < y.id ? -1 : 1)).slice(0, showAll ? undefined : 40).map((t) => {
                  const cell = (as, isBase) => {
                    if (!as) return <td colSpan={3} className="bad">not served</td>;
                    const tm = t.dir === 'DEP' ? as.res.doneAt : as.res.pickupAt;
                    const others = as.trip.tasks.filter((x) => x.id !== t.id).map((x) => x.id);
                    return <>
                      <td className="mono">{as.bus}{isBase && base.reassigned[t.id] && <Tag minimal intent={Intent.WARNING} className="ml">re-assigned</Tag>}{!isBase && S.overrides[t.id] && <Tag minimal intent={Intent.WARNING} className="ml">override</Tag>}{others.length > 0 && <Tag minimal className="ml">+{ids(others)}</Tag>}</td>
                      <td className="mono">{fmt(tm)}</td><td className={'mono ' + (as.res.late ? 'bad' : 'good')}>{as.res.late ? '+' + as.res.late : '0'}</td>
                    </>;
                  };
                  return <tr key={t.id}><td className="mono strong">{t.id}</td><td className="mono">{t.flight}</td><td><DirTag dir={t.dir} /></td><td className="mono">{fmt(t.due)}</td>{cell(base.byTask[t.id], true)}{cell(plan.byTask[t.id], false)}</tr>;
                })}
              </tbody>
            </HTMLTable>
          </div>
          <p className="bp6-text-muted small pad">Time = at the aircraft (DEP) or picked up (ARR). {S.tasks.length > 40 && <Button size="small" variant="minimal" onClick={() => setShowAll((x) => !x)}>{showAll ? 'Show the first 40' : 'Show all ' + S.tasks.length + ' tasks'}</Button>}</p>
        </SectionCard>
      </Section>
    </>
  );
}

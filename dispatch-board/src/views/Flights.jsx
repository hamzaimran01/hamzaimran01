import React, { useState } from 'react';
import { Button, Callout, Classes, FormGroup, HTMLSelect, HTMLTable, Intent, NumericInput, Section, SectionCard, Switch, Tag } from '@blueprintjs/core';
import { useDb } from '../App.jsx';
import { fmt, generateTasks, toMin } from '../model.js';

export default function Flights() {
  const { flights, tasks, rules, setRules, buses, actions, t, autoReplan, replan, setView } = useDb();
  const [draft, setDraft] = useState(rules);
  const [showAll, setShowAll] = useState(false);
  const upcoming = flights.filter((f) => toMin(f.time) >= t - 10);
  const list = showAll ? flights : upcoming;
  const [delayF, setDelayF] = useState('');
  const [delayM, setDelayM] = useState('20');
  const [bdBus, setBdBus] = useState('');
  const byFlight = {};
  tasks.forEach((k) => { (byFlight[k.flight] = byFlight[k.flight] || []).push(k); });
  const num = (k, label, help, min = 0, max = 120) => (
    <FormGroup label={label} helperText={help} inline className="rule">
      <NumericInput value={draft[k]} min={min} max={max} onValueChange={(v) => setDraft((d) => ({ ...d, [k]: isNaN(v) ? d[k] : v }))} buttonPosition="right" size="small" style={{ width: 70 }} />
    </FormGroup>
  );
  const changed = JSON.stringify(draft) !== JSON.stringify(rules);

  return (
    <div className="flights">
      <div className="fl-grid">
        <Section elevation={1} icon="properties" title="Task generation rules" subtitle="How crew bus jobs are created from the flight schedule">
          <SectionCard>
            {num('depReadyBefore', 'Departing crew ready', 'minutes before STD, at the Crew Center')}
            {num('depDueBefore', 'Departing crew at aircraft', 'minutes before STD')}
            {num('arrReadyAfter', 'Arriving crew off the aircraft', 'minutes after STA')}
            {num('arrDueAfter', 'Arriving crew picked up by', 'minutes after STA')}
            {num('dispatchLead', 'Send job to driver tablet', 'minutes before the bus sets off', 0, 60)}
            <Switch checked={draft.splitWidebody} label="Widebody: cockpit and cabin travel as two jobs" onChange={(e) => setDraft((d) => ({ ...d, splitWidebody: e.target.checked }))} />
            <div className="row gap">
              <Button intent={Intent.PRIMARY} icon="tick" disabled={!changed} onClick={() => { setRules(draft); if (autoReplan) setTimeout(() => replan(generateTasks(flights, draft), buses, 'Rules changed'), 0); }}>Apply rules</Button>
              <Button variant="minimal" disabled={!changed} onClick={() => setDraft(rules)}>Discard</Button>
              <span className={Classes.TEXT_MUTED}>{flights.length} flights → {tasks.length} crew jobs</span>
            </div>
          </SectionCard>
        </Section>

        <Section elevation={1} icon="warning-sign" title="Inject a disruption" subtitle="Watch the board re-plan (or not, if auto re-plan is off)">
          <SectionCard className="disrupt">
            <div className="row gap wrap">
              <HTMLSelect value={delayF} onChange={(e) => setDelayF(e.target.value)} options={[{ value: '', label: 'Choose a flight…' }].concat(upcoming.slice(0, 60).map((f) => ({ value: f.flight, label: f.time + ' ' + f.flight + ' ' + f.type })))} />
              <HTMLSelect value={delayM} onChange={(e) => setDelayM(e.target.value)} options={['10', '20', '30', '45', '60'].map((m) => ({ value: m, label: '+' + m + ' min' }))} />
              <Button icon="time" disabled={!delayF} onClick={() => { actions.delayFlight(delayF, +delayM); setView('board'); }}>Delay flight</Button>
            </div>
            <div className="row gap wrap">
              <HTMLSelect value={bdBus} onChange={(e) => setBdBus(e.target.value)} options={[{ value: '', label: 'Choose a bus…' }].concat(buses.filter((b) => b.outFrom == null).map((b) => ({ value: b.id, label: b.id + ' · ' + b.driver })))} />
              <Button icon="warning-sign" intent={Intent.DANGER} variant="outlined" disabled={!bdBus} onClick={() => { actions.breakdown(bdBus); setView('board'); }}>Bus breaks down now</Button>
            </div>
            <div className="row gap wrap">
              <Button icon="add" onClick={() => { actions.shortNotice(); setView('board'); }}>Add a short-notice departure</Button>
              <span className={Classes.TEXT_MUTED}>STD in 55 min, so its crew job is urgent</span>
            </div>
            <Callout compact intent={autoReplan ? Intent.SUCCESS : Intent.WARNING} icon={autoReplan ? 'automatic-updates' : 'hand'}>
              {autoReplan ? 'Auto re-plan is on: the optimizer re-assigns open work immediately; jobs already sent to drivers stay where they are.' : 'Auto re-plan is off: disruptions show up as exceptions for the dispatcher to resolve by hand.'}
            </Callout>
          </SectionCard>
        </Section>
      </div>

      <Section elevation={1} icon="airplane" title={'Flight schedule · ' + list.length + (showAll ? '' : ' upcoming')} className="fl-sched"
        rightElement={<Switch checked={showAll} label="Show past flights" onChange={(e) => setShowAll(e.target.checked)} inline />}>
        <SectionCard padded={false}>
          <div className="table-wrap">
            <HTMLTable compact striped interactive className="full">
              <thead><tr><th>Time</th><th>Flight</th><th>Type</th><th>Aircraft</th><th>Stand</th><th>Area</th><th>Crew jobs</th><th /></tr></thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.flight}>
                    <td className="mono">{f.time}{f.delayed ? <Tag minimal intent={Intent.WARNING} className="ml">+{f.delayed}</Tag> : null}</td>
                    <td className="mono"><b>{f.flight}</b>{f.added && <Tag minimal intent={Intent.PRIMARY} className="ml">new</Tag>}</td>
                    <td><Tag minimal intent={f.type === 'DEP' ? Intent.PRIMARY : Intent.SUCCESS}>{f.type === 'DEP' ? 'STD' : 'STA'}</Tag></td>
                    <td>{f.aircraft}</td><td className="mono">{f.stand}</td><td>{f.area}</td>
                    <td className="mono">{(byFlight[f.flight] || []).map((k) => <Tag key={k.id} minimal className="ml0">{k.crew} {fmt(k.ready)}</Tag>)}</td>
                    <td><Button size="small" variant="minimal" icon="time" onClick={() => actions.delayFlight(f.flight, 15)}>+15</Button></td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </div>
        </SectionCard>
      </Section>
    </div>
  );
}

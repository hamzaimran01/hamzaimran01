import React, { useEffect, useState } from 'react';
import { Button, Callout, Card, Classes, HTMLSelect, Intent, NonIdealState, Section, SectionCard, Tag } from '@blueprintjs/core';
import { useDb } from '../App.jsx';
import { fmt, STATUS, taskStatus } from '../model.js';

/* Simulated in-bus driver tablet: jobs arrive here when they are sent; the driver confirms them, reports incidents and reads messages. */
export default function Terminal() {
  const { buses, tasks, ev, t, confirmed, rules, manualBus, setManualBus, actions, messages } = useDb();
  const [bus, setBus] = useState(manualBus || 'CB01');
  useEffect(() => { setManualBus(bus); return () => setManualBus(null); }, [bus]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = buses.find((x) => x.id === bus);
  const runs = (ev.byBus[bus] || []);
  const visible = runs.map((g) => ({ g, st: taskStatus(g.tasks[0], ev, t, confirmed, rules, bus) })).filter(({ st }) => st !== 'planned' && st !== 'done');
  const nextPlanned = runs.find((g) => taskStatus(g.tasks[0], ev, t, confirmed, rules, bus) === 'planned');
  const out = b.outFrom != null && t >= b.outFrom;

  return (
    <div className="term-wrap">
      <Section elevation={1} icon="mobile-phone" title="Driver tablet (simulated)" subtitle="This tablet is driven by hand: its jobs are not auto-confirmed. All other buses confirm automatically after a short delay.">
        <SectionCard>
          <div className="row gap wrap">
            <span>Show the tablet of</span>
            <HTMLSelect value={bus} onChange={(e) => setBus(e.target.value)} options={buses.map((x) => ({ value: x.id, label: x.id + ' · ' + x.driver }))} />
            <span className={Classes.TEXT_MUTED}>Tip: press Play and watch jobs arrive {rules.dispatchLead} min before the bus sets off.</span>
          </div>
        </SectionCard>
      </Section>

      <div className="tablet bp6-dark">
        <div className="tab-head">
          <div><b className="mono">{bus}</b> <span className={Classes.TEXT_MUTED}>driver {b.driver}</span></div>
          <div className="mono">{fmt(t)}</div>
          <Tag intent={out ? Intent.DANGER : Intent.SUCCESS} round>{out ? 'Out of service' : 'On duty'}</Tag>
        </div>
        <div className="tab-body">
          <div className="tab-col">
            <div className="tab-h">My jobs</div>
            {visible.length ? visible.map(({ g, st }) => (
              <Card key={g.grp} compact className={'tab-job st-' + st}>
                <div className="row gap wrap"><b className="mono">{g.tasks.map((k) => k.id).join(' + ')}</b><Tag minimal intent={STATUS[st].intent}>{STATUS[st].label}</Tag></div>
                <div className="tab-route">{g.r.route.join(' → ')}</div>
                <div className={Classes.TEXT_MUTED}>Leave {fmt(g.r.start)} · {g.tasks.reduce((s, k) => s + k.pax, 0)} crew · {g.tasks[0].dir === 'DEP' ? 'at aircraft by ' + fmt(Math.min(...g.tasks.map((k) => k.due))) : 'pick up by ' + fmt(Math.min(...g.tasks.map((k) => k.due)))}</div>
                {st === 'sent' && <Button intent={Intent.SUCCESS} size="large" icon="tick" fill onClick={() => g.tasks.forEach((k) => actions.confirm(k.id))}>Confirm job</Button>}
              </Card>
            )) : <NonIdealState icon="time" title="No job right now" description={nextPlanned ? 'Next job arrives at ' + fmt(nextPlanned.r.start - rules.dispatchLead) + '.' : 'No more jobs planned for this bus.'} />}
          </div>
          <div className="tab-col">
            <div className="tab-h">Report</div>
            <div className="tab-btns">
              {['Traffic delay', 'Crew not at pickup', 'Vehicle defect'].map((k) => (
                <Button key={k} size="large" intent={k === 'Vehicle defect' ? Intent.DANGER : Intent.WARNING} variant="outlined" icon={k === 'Vehicle defect' ? 'warning-sign' : 'issue'} onClick={() => actions.incident(bus, k)}>{k}</Button>
              ))}
            </div>
            <div className="tab-h">Messages</div>
            {(messages[bus] || []).length ? (messages[bus] || []).slice(0, 6).map((m, i) => <Callout key={i} compact icon="chat" className="tab-msg"><span className="mono">{fmt(m.at)}</span> <b>{m.from}:</b> {m.text}</Callout>)
              : <span className={Classes.TEXT_MUTED}>No messages. Dispatchers can write to this tablet from the bus details on the board.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

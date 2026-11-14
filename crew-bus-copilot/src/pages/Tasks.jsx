import React, { useState } from 'react';
import { Alert, Button, Callout, Card, Collapse, HTMLTable, Intent, Tag, TextArea } from '@blueprintjs/core';
import { useApp } from '../App.jsx';
import { busOutLabel, fmt, HELP } from '../logic.js';
import { BusChip, DirTag, PageIntro, Tip } from '../ui.jsx';

const EXAMPLES = ['LH400 delayed 30 min', 'B03 broke down', 'B05 out of service from 06:30', 'add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45', 'cancel LH1500'];

export default function TasksPage() {
  const { S, plan, draft, setDraft, parseOut, setParseOut, applyDisruption, actions, setTab, select, flash } = useApp();
  const [help, setHelp] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const submit = () => {
    if (!draft.trim()) return;
    const r = applyDisruption(draft);
    if (r && r.results.every((x) => x.ok)) setDraft('');
  };
  const timeCell = (now, orig) => (now !== orig ? <><span className="strike">{fmt(orig)}</span> {fmt(now)}</> : fmt(now));

  return (
    <>
      <PageIntro title="Crew tasks">
        Every row is a crew that needs a bus: to its aircraft (<b>DEP</b>arture) or back from it (<b>ARR</b>ival). Something changed on the apron? Describe it in plain words below and the plan updates.
      </PageIntro>
      <div className="grid-2">
        <Card className="disrupt" elevation={1}>
          <h2 className="bp6-heading card-h">Report a disruption <Tip text="Type what happened, the way you would say it on the radio. The copilot re-plans every bus instantly." /></h2>
          <div className="composer">
            <TextArea id="disruptText" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. LH400 delayed 30 min" aria-label="Disruption" fill autoResize
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} className="mono-input" />
            <Button intent={Intent.PRIMARY} icon="flash" size="large" onClick={submit}>Update plan</Button>
          </div>
          <div className="chips"><span className="bp6-text-muted small">Try</span>
            {EXAMPLES.map((x) => <Tag key={x} interactive minimal round className="chip" onClick={() => { setDraft(x); document.getElementById('disruptText').focus(); }}>{x}</Tag>)}
          </div>
          {parseOut && (
            <div className="results" aria-live="polite">
              {parseOut.results.map((r, i) => (
                <Callout key={i} intent={r.ok ? Intent.SUCCESS : Intent.DANGER} icon={r.ok ? 'tick-circle' : 'error'} compact className="result" style={{ '--i': i }}>
                  <span className="mono">{r.text}</span><br /><span className="small">{r.msg}</span>
                </Callout>
              ))}
              {parseOut.results.some((r) => r.ok) && (
                <Callout intent={Intent.PRIMARY} icon="exchange" compact className="changed-sum">
                  <span>{parseOut.changed.length ? parseOut.changed.length + ' task(s) moved to another bus: ' + parseOut.changed.join(', ') : 'No bus changed, times updated.'}</span>
                  <span className="row gap"><Button size="small" variant="outlined" onClick={() => setTab('plan')}>Plan</Button><Button size="small" intent={Intent.PRIMARY} icon="map" onClick={() => setTab('live')}>Live map</Button></span>
                </Callout>
              )}
              {parseOut.results.some((r) => !r.ok) && <p className="bp6-text-muted small">You can type: {HELP.join(' · ')}</p>}
            </div>
          )}
          <div className="row gap wrap foot-actions">
            <Button variant="minimal" icon="undo" disabled={!S.history.length} onClick={() => actions.undo()}>Undo last change</Button>
            <Button variant="minimal" intent={Intent.DANGER} icon="reset" onClick={() => setConfirmReset(true)}>Reset day</Button>
            <Button variant="minimal" icon="manual" onClick={() => setHelp((h) => !h)} endIcon={help ? 'chevron-up' : 'chevron-down'}>What can I type?</Button>
          </div>
          <Collapse isOpen={help}>
            <ul className="help-list">{HELP.map((h) => <li key={h} className="mono">{h}</li>)}</ul>
            <p className="bp6-text-muted small">No due time? We assume ready + 15 min (DEP) or + 10 min (ARR). No crew size? We assume 6. A bus out of service without a time is out all day.</p>
          </Collapse>
          <Alert isOpen={confirmReset} intent={Intent.DANGER} icon="reset" confirmButtonText="Reset day" cancelButtonText="Cancel" canEscapeKeyCancel canOutsideClickCancel
            onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); actions.reset(); setParseOut(null); }}>
            <p>Go back to the original sample day? Your disruptions, accepts and overrides are cleared.</p>
          </Alert>
        </Card>
        <Card elevation={1}>
          <h2 className="bp6-heading card-h">Changes today</h2>
          <ul className="log">
            {S.log.length ? S.log.slice().reverse().map((l, i) => <li key={i}><span className="mono">{l.text}</span><span className="bp6-text-muted small">{l.msg}</span></li>)
              : <li className="bp6-text-muted small">Nothing yet. The plan is for the original sample day.</li>}
          </ul>
          <h4 className="bp6-heading sub-h">Buses</h4>
          <ul className="bus-list">
            {S.buses.map((b) => {
              const out = busOutLabel(b);
              return <li key={b.id} className={'bus-li' + (out ? ' out' : '')}><BusChip id={b.id} intent={out ? Intent.DANGER : undefined} /><span className="bp6-text-muted small grow">{b.driver} · starts at {b.start} · {b.shift}</span>
                <Tag minimal intent={out ? Intent.DANGER : Intent.SUCCESS}>{out || 'In service'}</Tag></li>;
            })}
          </ul>
        </Card>
      </div>
      <Card elevation={1}>
        <div className="row between wrap"><h2 className="bp6-heading card-h">All crew tasks <span className="bp6-text-muted">{S.tasks.length}</span></h2>
          <Button intent={Intent.PRIMARY} variant="outlined" endIcon="arrow-right" onClick={() => setTab('plan')}>See the copilot plan</Button></div>
        <div className="table-wrap">
          <HTMLTable className="tbl tasks-table" interactive compact>
            <thead><tr>
              <th>Task</th><th>Flight</th><th>Type <Tip text="DEP: take the crew from the Crew Center to their departing aircraft. ARR: pick an arriving crew up at the aircraft and bring them back." /></th><th>Crew</th><th className="num">People</th><th>From → to</th>
              <th>Ready <Tip text="The crew can board the bus from this time." /></th><th>Due <Tip text="DEP: crew must be at the aircraft by this time. ARR: crew must be picked up by this time." /></th>
              <th>Dispatcher’s bus <Tip text="The bus today’s dispatcher assigned by phone." /></th><th>Copilot’s bus</th><th />
            </tr></thead>
            <tbody>
              {S.tasks.slice().sort((a, b) => a.ready - b.ready || (a.id < b.id ? -1 : 1)).map((t) => {
                const a = plan.byTask[t.id], late = a && a.res.late;
                const cls = (t.flags.length ? 'changed ' : '') + (late ? 'late ' : '') + (flash.changed.includes(t.id) ? 'flash' : '');
                return (
                  <tr key={t.id + flash.n} className={cls} onClick={() => select('task', t.id, 'live')}>
                    <td className="mono strong"><a role="button">{t.id}</a></td><td className="mono">{t.flight}</td><td><DirTag dir={t.dir} /></td><td>{t.crew}</td><td className="num">{t.pax}</td>
                    <td>{t.from} → {t.to}</td><td className="mono">{timeCell(t.ready, t.origReady)}</td><td className="mono">{timeCell(t.due, t.origDue)}</td>
                    <td className="mono">{t.dispatcherBus || <span className="bp6-text-muted">—</span>}</td>
                    <td className="mono">{a ? <b>{a.bus}</b> : <span className="bad">none</span>}</td>
                    <td>{t.flags.map((f) => <Tag key={f} minimal intent={Intent.PRIMARY}>{f}</Tag>)} {late ? <Tag minimal intent={Intent.DANGER}>{late} min late</Tag> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </HTMLTable>
        </div>
      </Card>
    </>
  );
}

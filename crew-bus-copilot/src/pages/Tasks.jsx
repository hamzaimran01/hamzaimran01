import React, { useState } from 'react';
import { Alert, Button, Callout, Classes, Collapse, HTMLTable, Intent, Section, SectionCard, Tag, TextArea } from '@blueprintjs/core';
import { useApp } from '../App.jsx';
import { busOutLabel, fmt, HELP, shortList } from '../logic.js';
import { BusChip, DirTag, DriverAvatar, PageIntro, Tip } from '../ui.jsx';

const EXAMPLES = ['LH400 delayed 30 min', 'B03 broke down', 'B05 out of service from 06:30', 'add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45', 'cancel LH1500'];

export default function TasksPage() {
  const { S, plan, draft, setDraft, parseOut, setParseOut, applyDisruption, actions, setTab, select, flash } = useApp();
  const [help, setHelp] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showAll, setShowAll] = useState(false);

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
        <Section className="disrupt" title="Report a disruption" icon="flash" subtitle="Type it the way you would say it on the radio" elevation={1}
          rightElement={<Tip text="The copilot re-plans every bus as soon as you press Update plan." />}>
          <SectionCard>
            <div className="composer">
              <TextArea id="disruptText" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. LH400 delayed 30 min" aria-label="Disruption" fill autoResize
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} className={Classes.MONOSPACE_TEXT} />
              <Button intent={Intent.PRIMARY} icon="flash" onClick={submit}>Update plan</Button>
            </div>
            <div className="chips"><span className={Classes.TEXT_MUTED}>Try</span>
              {EXAMPLES.map((x) => <Tag key={x} interactive minimal className={Classes.MONOSPACE_TEXT} onClick={() => { setDraft(x); document.getElementById('disruptText').focus(); }}>{x}</Tag>)}
            </div>
            {parseOut && (
              <div className="stack" aria-live="polite">
                {parseOut.results.map((r, i) => (
                  <Callout key={i} intent={r.ok ? Intent.SUCCESS : Intent.DANGER} icon={r.ok ? 'tick-circle' : 'error'} compact title={r.text}>{r.msg}</Callout>
                ))}
                {parseOut.results.some((r) => r.ok) && (
                  <Callout intent={Intent.PRIMARY} icon="exchange" compact>
                    {parseOut.changed.length ? parseOut.changed.length + ' crew tasks moved to a better bus: ' + shortList(parseOut.changed) + '. ' : 'No bus changed, times updated. '}
                    <Button size="small" variant="minimal" intent={Intent.PRIMARY} onClick={() => setTab('plan')}>Open plan</Button>
                    <Button size="small" variant="minimal" intent={Intent.PRIMARY} icon="map" onClick={() => setTab('live')}>Live map</Button>
                  </Callout>
                )}
                {parseOut.results.some((r) => !r.ok) && <p className={Classes.TEXT_MUTED}>You can type: {HELP.join(' · ')}</p>}
              </div>
            )}
          </SectionCard>
          <SectionCard className="row gap wrap">
            <Button variant="minimal" icon="undo" disabled={!S.history.length} onClick={() => actions.undo()}>Undo last change</Button>
            <Button variant="minimal" intent={Intent.DANGER} icon="reset" onClick={() => setConfirmReset(true)}>Reset day</Button>
            <Button variant="minimal" icon="manual" onClick={() => setHelp((h) => !h)} endIcon={help ? 'chevron-up' : 'chevron-down'}>What can I type?</Button>
            <Collapse isOpen={help} className="full">
              <ul className={Classes.LIST + ' ' + Classes.MONOSPACE_TEXT}>{HELP.map((h) => <li key={h}>{h}</li>)}</ul>
              <p className={Classes.TEXT_MUTED}>No due time? We assume ready + 15 min (DEP) or + 10 min (ARR). No crew size? We assume 6. A bus out of service without a time is out all day.</p>
            </Collapse>
          </SectionCard>
          <Alert isOpen={confirmReset} intent={Intent.DANGER} icon="reset" confirmButtonText="Reset day" cancelButtonText="Cancel" canEscapeKeyCancel canOutsideClickCancel
            onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); actions.reset(); setParseOut(null); }}>
            <p>Go back to the original sample day? Your disruptions, accepts and overrides are cleared.</p>
          </Alert>
        </Section>
        <Section title="Changes today" icon="history" elevation={1}>
          <SectionCard>
            {S.log.length ? (
              <ul className={Classes.LIST_UNSTYLED + ' log'}>{S.log.slice().reverse().map((l, i) => <li key={i}><span className={Classes.MONOSPACE_TEXT}>{l.text}</span><br /><span className={Classes.TEXT_MUTED}>{l.msg}</span></li>)}</ul>
            ) : <p className={Classes.TEXT_MUTED}>Nothing yet. The plan is for the original sample day.</p>}
          </SectionCard>
          <SectionCard padded={false}>
            <HTMLTable compact className="full-table">
              <thead><tr><th>Bus</th><th>Driver</th><th>Starts at</th><th>Shift</th><th>Status</th></tr></thead>
              <tbody>{S.buses.map((b) => { const out = busOutLabel(b); return (
                <tr key={b.id}><td><BusChip id={b.id} intent={out ? Intent.DANGER : undefined} /></td><td><span className="row gap"><DriverAvatar driver={b.driver} size={24} /><span className={Classes.MONOSPACE_TEXT}>{b.driver}</span></span></td><td>{b.start}</td><td className={Classes.MONOSPACE_TEXT}>{b.shift}</td>
                  <td><Tag minimal intent={out ? Intent.DANGER : Intent.SUCCESS}>{out || 'In service'}</Tag></td></tr>); })}</tbody>
            </HTMLTable>
          </SectionCard>
        </Section>
      </div>
      <Section title={'All crew tasks (' + S.tasks.length + ')'} icon="th-list" elevation={1} className="sec"
        rightElement={<Button intent={Intent.PRIMARY} endIcon="arrow-right" onClick={() => setTab('plan')}>See the copilot plan</Button>}>
        <SectionCard padded={false}>
          <div className="table-wrap">
            <HTMLTable className="full-table tasks-table" interactive compact striped>
              <thead><tr>
                <th>Task</th><th>Flight</th><th>Type <Tip text="DEP: take the crew from the Crew Center to their departing aircraft. ARR: pick an arriving crew up at the aircraft and bring them back." /></th><th>Crew</th><th>People</th><th>From → to</th>
                <th>Ready <Tip text="The crew can board the bus from this time." /></th><th>Due <Tip text="DEP: crew must be at the aircraft by this time. ARR: crew must be picked up by this time." /></th>
                <th>Dispatcher’s bus <Tip text="The bus today’s dispatcher assigned by phone." /></th><th>Copilot’s bus</th><th />
              </tr></thead>
              <tbody>
                {S.tasks.slice().sort((a, b) => a.ready - b.ready || (a.id < b.id ? -1 : 1)).slice(0, showAll ? undefined : 60).map((t) => {
                  const a = plan.byTask[t.id], late = a && a.res.late;
                  return (
                    <tr key={t.id + flash.n} className={(flash.changed.includes(t.id) ? 'flash ' : '') + (late ? 'is-late' : '')} onClick={() => select('task', t.id, 'live')}>
                      <td className={Classes.MONOSPACE_TEXT}><b>{t.id}</b></td><td className={Classes.MONOSPACE_TEXT}>{t.flight}</td><td><DirTag dir={t.dir} /></td><td>{t.crew}</td><td>{t.pax}</td>
                      <td>{t.from} → {t.to}</td><td className={Classes.MONOSPACE_TEXT}>{timeCell(t.ready, t.origReady)}</td><td className={Classes.MONOSPACE_TEXT}>{timeCell(t.due, t.origDue)}</td>
                      <td className={Classes.MONOSPACE_TEXT}>{t.dispatcherBus || <span className={Classes.TEXT_MUTED}>—</span>}</td>
                      <td className={Classes.MONOSPACE_TEXT}>{a ? <b>{a.bus}</b> : <Tag intent={Intent.DANGER}>none</Tag>}</td>
                      <td>{t.flags.map((f) => <Tag key={f} minimal intent={Intent.PRIMARY}>{f}</Tag>)} {late ? <Tag minimal intent={Intent.DANGER}>{late} min late</Tag> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </HTMLTable>
          </div>
          {S.tasks.length > 60 && <div className="pad"><Button variant="minimal" icon={showAll ? 'chevron-up' : 'chevron-down'} onClick={() => setShowAll((x) => !x)}>{showAll ? 'Show the first 60' : 'Show all ' + S.tasks.length + ' tasks'}</Button></div>}
        </SectionCard>
      </Section>
    </>
  );
}

import React from 'react';
import { Card, Classes, HTMLTable, Section, SectionCard } from '@blueprintjs/core';
import { useDb } from '../App.jsx';
import { fmt } from '../model.js';

export default function Kpis() {
  const { tasks, buses, ev, exc } = useDb();
  const m = ev.metrics;
  const onTime = m.assigned ? Math.round((m.assigned - m.late) / tasks.length * 100) : 0;
  const tiles = [
    ['Crew jobs', m.tasks], ['On time', onTime + '%'], ['Late jobs', m.late], ['Late minutes', m.lateMin],
    ['Unassigned', m.open], ['Buses in use', m.busesUsed + ' / ' + buses.length], ['Bus runs', m.runs], ['Crews per run', m.runs ? (m.assigned / m.runs).toFixed(2) : '–'],
    ['Total km', Math.round(m.km)], ['Empty km', Math.round(m.emptyKm)], ['Empty share', m.km ? Math.round(m.emptyKm / m.km * 100) + '%' : '–'], ['Open exceptions', exc.length]
  ];
  const hours = {};
  tasks.forEach((k) => { const h = Math.floor(k.ready / 60); const a = ev.byTask[k.id]; const r = (hours[h] = hours[h] || { jobs: 0, late: 0, dep: 0, arr: 0 }); r.jobs++; r[k.dir === 'DEP' ? 'dep' : 'arr']++; if (a && a.res.late) r.late++; });
  return (
    <div className="kpis-view">
      <div className="tiles">{tiles.map(([l, v]) => <Card key={l} compact className="tile"><div className="tile-v">{v}</div><div className={Classes.TEXT_MUTED}>{l}</div></Card>)}</div>
      <div className="fl-grid">
        <Section elevation={1} icon="time" title="Jobs per hour">
          <SectionCard padded={false}>
            <HTMLTable compact striped className="full">
              <thead><tr><th>Hour</th><th>Jobs</th><th>To aircraft</th><th>From aircraft</th><th>Late</th></tr></thead>
              <tbody>{Object.keys(hours).sort((a, b) => a - b).map((h) => <tr key={h}><td className="mono">{fmt(h * 60)}</td><td>{hours[h].jobs}</td><td>{hours[h].dep}</td><td>{hours[h].arr}</td><td className={hours[h].late ? 'bad' : ''}>{hours[h].late}</td></tr>)}</tbody>
            </HTMLTable>
          </SectionCard>
        </Section>
        <Section elevation={1} icon="drive-time" title="Vehicle utilisation" subtitle="Per bus (vehicle), not per driver">
          <SectionCard padded={false}>
            <HTMLTable compact striped className="full">
              <thead><tr><th>Bus</th><th>Runs</th><th>Busy</th><th>Empty drive</th></tr></thead>
              <tbody>{buses.map((b) => { const runs = ev.byBus[b.id] || []; const busy = runs.reduce((s, g) => s + g.r.end - g.r.start, 0), empty = runs.reduce((s, g) => s + g.r.empty, 0); return <tr key={b.id}><td className="mono">{b.id}</td><td>{runs.length}</td><td>{busy} min</td><td>{empty} min</td></tr>; })}</tbody>
            </HTMLTable>
          </SectionCard>
        </Section>
      </div>
    </div>
  );
}

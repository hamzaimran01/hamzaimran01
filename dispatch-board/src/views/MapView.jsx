import React, { memo } from 'react';
import { Classes, Section, SectionCard, Tag } from '@blueprintjs/core';
import { useDb } from '../App.jsx';
import { FraMap } from '../map.js';
import { fmt } from '../model.js';

const StaticMap = memo(() => <div className="map-static" dangerouslySetInnerHTML={{ __html: FraMap.staticSvg([]) }} />);

/* Where each bus is according to the plan at the current time. */
function busPosition(b, runs, t) {
  let loc = b.start;
  for (const g of runs) {
    if (t < g.r.start) break;
    if (t >= g.r.end) { loc = g.r.endLoc; continue; }
    const s = g.r.steps.find((x) => t >= x.start && t < x.end);
    if (s && (s.type === 'empty' || s.type === 'drive')) return { ...FraMap.along(s.from, s.to, (t - s.start) / (s.end - s.start)), moving: true, kind: s.type, run: g };
    return { ...FraMap.node(s ? s.at : loc), moving: false, kind: s ? s.type : 'idle', run: g };
  }
  return { ...FraMap.node(loc), moving: false, kind: 'idle' };
}

export default function MapView() {
  const { buses, ev, t, setSel, setView } = useDb();
  const pos = buses.map((b) => ({ b, p: busPosition(b, ev.byBus[b.id] || [], t) }));
  const stack = {};
  pos.forEach(({ b, p }) => { if (!p.moving) { const k = Math.round(p.x) + ',' + Math.round(p.y); (stack[k] = stack[k] || []).push(b.id); } });
  const moving = pos.filter(({ p }) => p.moving).length;
  return (
    <Section elevation={1} icon="map" title="Apron map" subtitle={'Planned positions at ' + fmt(t) + ' · ' + moving + ' of ' + buses.length + ' buses driving · schematic, not GPS'} className="map-sec">
      <SectionCard>
        <div className="map-wrap">
          <StaticMap />
          <svg className="map-overlay" viewBox="0 0 1000 600">
            {pos.map(({ b, p }) => {
              let { x, y } = p;
              if (!p.moving) { const g = stack[Math.round(x) + ',' + Math.round(y)], i = g.indexOf(b.id); if (g.length > 1) { const ring = 1 + Math.floor(i / 6), a = -Math.PI / 2 + (i % 6) * Math.PI / 3 + ring * 0.4; x += Math.cos(a) * 17 * ring; y += Math.sin(a) * 17 * ring; } }
              const out = b.outFrom != null && t >= b.outFrom;
              return (
                <g key={b.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} className={'mb mb-' + (out ? 'out' : p.kind)} onClick={() => { setSel({ kind: 'bus', id: b.id }); setView('board'); }} role="button" aria-label={'Bus ' + b.id}>
                  <circle r="9" /><text y="3">{b.id.slice(2)}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="map-legend">
          <span><i className="ml-dot mb-drive" />With crew</span><span><i className="ml-dot mb-empty" />Driving empty</span><span><i className="ml-dot mb-board" />Boarding / waiting</span><span><i className="ml-dot mb-idle" />Standby</span><span><i className="ml-dot mb-out" />Out of service</span>
          <span className={Classes.TEXT_MUTED}>Click a bus to open it on the board.</span>
        </div>
      </SectionCard>
    </Section>
  );
}

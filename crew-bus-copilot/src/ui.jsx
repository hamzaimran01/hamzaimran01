import React from 'react';
import { Icon, Tag, Tooltip, Intent } from '@blueprintjs/core';

export function PageIntro({ title, children, right }) {
  return (
    <div className="page-intro">
      <div>
        <h1 className="bp6-heading">{title}</h1>
        <p>{children}</p>
      </div>
      {right}
    </div>
  );
}

export function Tip({ text }) {
  return (
    <Tooltip content={<span className="tip-text">{text}</span>} placement="top" compact>
      <Icon icon="help" size={12} className="tip-ic" tabIndex={0} aria-label={text} />
    </Tooltip>
  );
}

export function DirTag({ dir }) {
  return <Tag className={'dir dir-' + dir} intent={dir === 'DEP' ? Intent.PRIMARY : Intent.SUCCESS}>{dir}</Tag>;
}

export const TASK_STATE = {
  planned: { intent: Intent.NONE, minimal: true },
  enroute: { intent: Intent.PRIMARY, minimal: true },
  boarding: { intent: Intent.WARNING, minimal: true },
  onboard: { intent: Intent.PRIMARY, minimal: false },
  done: { intent: Intent.SUCCESS, minimal: true },
  late: { intent: Intent.DANGER, minimal: false }
};
export function TaskStateTag({ k, label }) {
  const s = TASK_STATE[k] || TASK_STATE.planned;
  return <Tag intent={s.intent} minimal={s.minimal} round className="state-tag">{label}</Tag>;
}

export const BUS_STATE = {
  idle: { intent: Intent.NONE, minimal: true }, off: { intent: Intent.NONE, minimal: true },
  empty: { intent: Intent.NONE, minimal: false }, wait: { intent: Intent.WARNING, minimal: true },
  board: { intent: Intent.WARNING, minimal: true }, drive: { intent: Intent.PRIMARY, minimal: false },
  drop: { intent: Intent.SUCCESS, minimal: true }, out: { intent: Intent.DANGER, minimal: false }
};
export function BusStateTag({ kind, label }) {
  const s = BUS_STATE[kind] || BUS_STATE.idle;
  return <Tag intent={s.intent} minimal={s.minimal} className="bus-state">{label}</Tag>;
}

export function BusChip({ id, large, intent }) {
  return <Tag className={'bus-chip' + (large ? ' lg' : '')} intent={intent} minimal={!intent} icon="drive-time">{id}</Tag>;
}

/** Count-up number for KPIs. */
export function CountUp({ value }) {
  const [shown, setShown] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const a = prev.current, b = value; prev.current = value;
    if (a === b || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(b); return; }
    let raf, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (b - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

export function Kpi({ label, value, of, unit, intent, tip }) {
  return (
    <div className={'kpi' + (intent ? ' kpi-' + intent : '')}>
      <div className="kpi-v"><CountUp value={value} />{of != null && <span className="kpi-of">/{of}</span>}{unit && <span className="kpi-of"> {unit}</span>}</div>
      <div className="kpi-l">{label} {tip && <Tip text={tip} />}</div>
    </div>
  );
}

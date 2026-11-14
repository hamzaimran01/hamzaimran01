import React from 'react';
import { Card, Classes, H2, Icon, Intent, Tag, Tooltip } from '@blueprintjs/core';

/** Page header: Blueprint heading + muted running text. */
export function PageIntro({ title, children, right }) {
  return (
    <div className="page-intro">
      <div>
        <H2>{title}</H2>
        <p className={Classes.TEXT_MUTED + ' ' + Classes.RUNNING_TEXT}>{children}</p>
      </div>
      {right}
    </div>
  );
}

export function Tip({ text }) {
  return (
    <Tooltip content={text} placement="top" compact className="tip">
      <Icon icon="help" size={12} className={Classes.TEXT_MUTED} tabIndex={0} aria-label={text} />
    </Tooltip>
  );
}

export function DirTag({ dir }) {
  return <Tag intent={dir === 'DEP' ? Intent.PRIMARY : Intent.SUCCESS} className="dir">{dir}</Tag>;
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
  return <Tag intent={s.intent} minimal={s.minimal} round>{label}</Tag>;
}

export const BUS_STATE = {
  idle: { intent: Intent.NONE, minimal: true }, off: { intent: Intent.NONE, minimal: true },
  empty: { intent: Intent.NONE, minimal: false }, wait: { intent: Intent.WARNING, minimal: true },
  board: { intent: Intent.WARNING, minimal: true }, drive: { intent: Intent.PRIMARY, minimal: false },
  drop: { intent: Intent.SUCCESS, minimal: true }, out: { intent: Intent.DANGER, minimal: false }
};
export function BusStateTag({ kind, label }) {
  const s = BUS_STATE[kind] || BUS_STATE.idle;
  return <Tag intent={s.intent} minimal={s.minimal}>{label}</Tag>;
}

export function BusChip({ id, intent }) {
  return <Tag className="bus-chip" intent={intent} minimal={!intent} icon="drive-time">{id}</Tag>;
}

/** Count-up number for KPIs. */
export function CountUp({ value }) {
  const [shown, setShown] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const a = prev.current, b = value; prev.current = value;
    if (a === b || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(b); return undefined; }
    let raf; const t0 = performance.now();
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

/** KPI as a compact Blueprint Card. */
export function Kpi({ label, value, of, unit, intent, tip }) {
  return (
    <Card compact className="kpi">
      <div className={'kpi-v' + (intent === 'good' ? ' ' + Classes.INTENT_SUCCESS : intent === 'bad' ? ' ' + Classes.INTENT_DANGER : '')}>
        <CountUp value={value} />{of != null && <span className={Classes.TEXT_MUTED}>/{of}</span>}{unit && <span className={Classes.TEXT_MUTED}> {unit}</span>}
      </div>
      <div className={Classes.TEXT_MUTED + ' kpi-l'}>{label} {tip && <Tip text={tip} />}</div>
    </Card>
  );
}

/* Pseudonymous driver avatar: initials-style badge with the driver ID only (no photo, no name). */
const AVATAR_HUES = ['blue', 'forest', 'orange', 'violet', 'turquoise', 'rose', 'gold', 'indigo', 'sepia', 'lime'];
export function DriverAvatar({ driver, size = 40, status, selected, dim, onClick, title }) {
  const n = parseInt(String(driver).replace(/\D/g, ''), 10) || 0;
  const hue = AVATAR_HUES[(n - 1 + AVATAR_HUES.length) % AVATAR_HUES.length];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.34), background: `var(--bp-palette-${hue}-3)` };
  const el = (
    <button type="button" className={'avatar' + (selected ? ' is-sel' : '') + (dim ? ' is-dim' : '')} style={style} onClick={onClick} aria-label={title || driver}>
      <span className="avatar-id">{String(driver).replace('D-', '')}</span>
      {status && <span className={'avatar-dot dot-' + status} />}
    </button>
  );
  return title ? <Tooltip content={title} placement="top" compact>{el}</Tooltip> : el;
}

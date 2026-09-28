/* eslint-disable react-refresh/only-export-components */
import React from 'react';

/* =========================================================================
   Mis Finanzas — Design System Primitives
   ========================================================================= */

// ---------------------------------------------------------------------------
// Icon — Material Symbols Outlined wrapper
// ---------------------------------------------------------------------------
export const Icon = React.memo(function Icon({ name, size = 20, fill = false, color, style = {}, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined${fill ? ' filled' : ''} ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${fill ? 500 : 400}, 'GRAD' 0, 'opsz' 24`,
        color: color || 'inherit',
        lineHeight: 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {name}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Eyebrow — uppercase tracking label
// ---------------------------------------------------------------------------
export const Eyebrow = React.memo(function Eyebrow({ children, color = 'var(--fg-3)', style = {} }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color,
      lineHeight: 1,
      ...style,
    }}>
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Card — three archetypes
// ---------------------------------------------------------------------------
export const Card = React.memo(function Card({
  variant = 'floating',
  moduleHue,
  padding = 16,
  style = {},
  onClick,
  children,
  className = '',
}) {
  const base = {
    borderRadius: 'var(--r-2xl)',
    padding,
    boxSizing: 'border-box',
    cursor: onClick ? 'pointer' : 'default',
    transition: `transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)`,
  };
  const variants = {
    floating: { background: 'var(--bg-raised)', boxShadow: 'var(--shadow-sm)' },
    outlined: { background: 'transparent', border: '1px solid var(--border-default)' },
    inset:    { background: 'var(--bg-sunken)', boxShadow: 'var(--shadow-inset)', borderRadius: 'var(--r-xl)' },
  };
  const moduleBar = moduleHue ? { borderLeft: `4px solid ${moduleHue}` } : {};

  return (
    <div
      className={className}
      style={{ ...base, ...variants[variant], ...moduleBar, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Pill / chip
// ---------------------------------------------------------------------------
export const Pill = React.memo(function Pill({ children, variant = 'neutral', icon, onClick, style = {} }) {
  const variants = {
    neutral:  { bg: 'var(--ink-50)',      fg: 'var(--fg-2)' },
    success:  { bg: 'var(--success-50)',  fg: 'var(--success-700)' },
    danger:   { bg: 'var(--danger-50)',   fg: 'var(--danger-700)' },
    warning:  { bg: 'var(--warning-50)',  fg: 'var(--warning-700)' },
    clay:     { bg: 'var(--clay-50)',     fg: 'var(--clay-600)' },
    olive:    { bg: 'var(--olive-50)',    fg: 'var(--olive-600)' },
    ink:      { bg: 'var(--ink-800)',     fg: '#fff' },
    outline:  { bg: 'transparent',        fg: 'var(--fg-2)', border: '1px solid var(--border-default)' },
  };
  const v = variants[variant] || variants.neutral;
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 9999,
        fontSize: 11, fontWeight: 700,
        background: v.bg, color: v.fg, border: v.border || 'none',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
});

// ---------------------------------------------------------------------------
// DeltaPill — trend indicator on KPIs
// ---------------------------------------------------------------------------
export const DeltaPill = ({ value, suffix = '%' }) => {
  const positive = value >= 0;
  return (
    <Pill variant={positive ? 'success' : 'danger'} icon={positive ? 'north_east' : 'south_east'}>
      {positive ? '+' : '−'}{Math.abs(value).toFixed(1)}{suffix}
    </Pill>
  );
};

// ---------------------------------------------------------------------------
// IconTile — tinted square icon container
// ---------------------------------------------------------------------------
export const IconTile = React.memo(function IconTile({ icon, hue = 'clay', size = 36 }) {
  const palette = {
    clay:    { bg: 'var(--clay-50)',    fg: 'var(--clay-600)' },
    olive:   { bg: 'var(--olive-50)',   fg: 'var(--olive-600)' },
    amber:   { bg: 'var(--amber-50)',   fg: 'var(--amber-500)' },
    plum:    { bg: 'var(--plum-50)',    fg: 'var(--plum-400)' },
    ink:     { bg: 'var(--ink-50)',     fg: 'var(--ink-700)' },
    success: { bg: 'var(--success-50)', fg: 'var(--success-700)' },
    danger:  { bg: 'var(--danger-50)',  fg: 'var(--danger-700)' },
    warning: { bg: 'var(--warning-50)', fg: 'var(--warning-700)' },
  };
  const p = palette[hue] || palette.clay;
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3),
      background: p.bg, color: p.fg, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon name={icon} size={Math.round(size * 0.52)} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// SparkLine
// ---------------------------------------------------------------------------
export const SparkLine = ({ points = [30, 22, 28, 14, 20, 8, 12, 6], color = 'var(--clay-500)', fill = true, height = 40 }) => {
  const max = Math.max(...points), min = Math.min(...points);
  const range = Math.max(1, max - min);
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 100;
    const y = ((p - min) / range) * 30 + 5;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {fill && <path d={`${d} L 100 40 L 0 40 Z`} fill={color} opacity="0.1" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------
export const ProgressBar = ({ value, max, color = 'var(--clay-500)', warningAt = 0.9, height = 8 }) => {
  const pct = Math.min(100, (value / max) * 100);
  const over = value > max;
  const warn = !over && value / max >= warningAt;
  const fill = over ? 'var(--danger-500)' : warn ? 'var(--warning-500)' : color;
  return (
    <div style={{ height, background: 'var(--bg-sunken)', borderRadius: 9999, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, background: fill,
        borderRadius: 9999, transition: `width var(--dur-slow) var(--ease-out)`,
      }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------
export const Segmented = ({ options, value, onChange, size = 'md' }) => {
  const pads = size === 'sm' ? '6px 10px' : '8px 14px';
  const font = size === 'sm' ? 11 : 12;
  return (
    <div style={{
      display: 'flex', background: 'var(--bg-sunken)', padding: 3, borderRadius: 12,
      boxShadow: 'var(--shadow-inset)', gap: 2,
    }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, border: 'none', cursor: 'pointer',
              padding: pads, fontSize: font, fontWeight: active ? 800 : 600,
              fontFamily: 'inherit',
              background: active ? 'var(--bg-raised)' : 'transparent',
              color: active ? 'var(--fg-1)' : 'var(--fg-3)',
              borderRadius: 9,
              boxShadow: active ? 'var(--shadow-xs)' : 'none',
              transition: `all var(--dur-fast) var(--ease-out)`,
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Money display — de-emphasised currency code
// ---------------------------------------------------------------------------
export const Money = ({ amount, currency = 'COP', sign = false, size = 'lg' }) => {
  const sizes = {
    sm: { num: 14, cur: 9 },
    md: { num: 20, cur: 11 },
    lg: { num: 28, cur: 12 },
    xl: { num: 40, cur: 16 },
  };
  const s = sizes[size] || sizes.lg;
  const abs = Math.abs(amount);
  const neg = amount < 0;
  const formatted = abs.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      fontWeight: 800, color: 'var(--fg-1)',
      fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
      fontSize: s.num, lineHeight: 1,
    }}>
      {neg ? '−' : sign ? '+' : ''}{formatted}
      <span style={{ fontSize: s.cur, color: 'var(--fg-3)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
        {currency}
      </span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Field label wrapper (for forms)
// ---------------------------------------------------------------------------
export const Field = ({ label, optional, children }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {optional ? <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>opcional</span> : null}
    </div>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// TextInput (design system styled)
// ---------------------------------------------------------------------------
export const TextInput = ({ value, onChange, placeholder, mono, type = 'text' }) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      width: '100%', boxSizing: 'border-box',
      border: '1px solid var(--border-default)',
      background: 'var(--bg-default)', borderRadius: 12, padding: '11px 12px',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 14,
      color: 'var(--fg-1)', outline: 'none',
      transition: `border-color var(--dur-fast) var(--ease-out)`,
    }}
    onFocus={e => { e.target.style.borderColor = 'var(--clay-500)'; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; }}
  />
);

// ---------------------------------------------------------------------------
// SelectInput
// ---------------------------------------------------------------------------
export const SelectInput = ({ value, onChange, options }) => (
  <div style={{
    position: 'relative', display: 'flex', alignItems: 'center',
    background: 'var(--bg-default)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: '0 12px',
  }}>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, border: 'none', outline: 'none', background: 'transparent',
        padding: '11px 0', fontSize: 14, color: 'var(--fg-1)',
        fontFamily: 'var(--font-sans)', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <Icon name="expand_more" size={18} color="var(--fg-3)" />
  </div>
);

// ---------------------------------------------------------------------------
// Editorial — Newsreader italic display moment
// ---------------------------------------------------------------------------
export const Editorial = ({ children, size = 28, color = 'var(--fg-1)', style = {} }) => (
  <div style={{
    fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500,
    fontSize: size, lineHeight: 1.05, letterSpacing: '-0.02em', color,
    ...style,
  }}>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// SectionHeader — eyebrow + title + optional action
// ---------------------------------------------------------------------------
export const SectionHeader = ({ title, eyebrow, action, onAction }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
    <div>
      {eyebrow ? <Eyebrow style={{ marginBottom: 4 }}>{eyebrow}</Eyebrow> : null}
      <div style={{
        fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 17,
        color: 'var(--fg-1)', letterSpacing: '-0.01em',
      }}>
        {title}
      </div>
    </div>
    {action ? (
      <button
        type="button"
        onClick={onAction}
        style={{
          background: 'transparent', border: 'none', cursor: onAction ? 'pointer' : 'default',
          color: 'var(--clay-600)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
          display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0, flexShrink: 0,
        }}
      >
        {action}<Icon name="chevron_right" size={16} />
      </button>
    ) : null}
  </div>
);

// ---------------------------------------------------------------------------
// IconBtn — square icon button
// ---------------------------------------------------------------------------
export const IconBtn = ({ icon, onClick, tone = 'ghost', size = 38, badge = false, fill = false, title, style = {} }) => {
  const tones = {
    ghost:    { bg: 'transparent',              fg: 'var(--fg-2)' },
    sunken:   { bg: 'var(--bg-sunken)',         fg: 'var(--fg-1)' },
    clay:     { bg: 'var(--clay-500)',          fg: '#fff' },
    glass:    { bg: 'rgba(255,255,255,0.12)',   fg: '#fff' },
  };
  const t = tones[tone] || tones.ghost;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: size, height: size, borderRadius: size >= 40 ? 12 : 10,
        background: t.bg, color: t.fg, border: 'none', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
        transition: 'background var(--dur-fast) var(--ease-out)',
        ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} fill={fill} />
      {badge ? (
        <span style={{
          position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%',
          background: 'var(--clay-500)', border: '2px solid var(--bg-canvas)',
        }} />
      ) : null}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Donut — multi-segment ring chart
// ---------------------------------------------------------------------------
export const Donut = ({ segments = [], size = 160, thickness = 22, gap = 0.015, children }) => {
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={thickness} />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const before = segments.slice(0, i).reduce((s, x) => s + x.value, 0) / total;
          const len = Math.max(0, frac * c - gap * c);
          const off = before * c + (gap * c) / 2;
          return (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={seg.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${c}`} strokeDashoffset={-off}
            />
          );
        })}
      </svg>
      {children ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        }}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// BarChart — vertical bars with optional highlight + labels
// ---------------------------------------------------------------------------
export const BarChart = ({
  data = [], height = 80, color = 'var(--clay-500)',
  highlightIdx, labels, trackColor = 'var(--parchment-200)',
}) => {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, width: '100%' }}>
      {data.map((v, i) => {
        const h = (v / max) * (height - (labels ? 16 : 0));
        const isHi = i === highlightIdx;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div style={{
              width: '100%', height: Math.max(2, h), borderRadius: 4,
              background: isHi ? color : trackColor, alignSelf: 'flex-end',
              transition: 'height var(--dur-slow) var(--ease-out)',
            }} />
            {labels ? (
              <span style={{ fontSize: 9, color: isHi ? 'var(--fg-1)' : 'var(--fg-3)', fontWeight: isHi ? 800 : 600 }}>
                {labels[i]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Category hue map (single source of truth)
// ---------------------------------------------------------------------------
export const HUE_BY_CATEGORY = {
  food:        'clay',
  software:    'amber',
  services:    'olive',
  salud:       'plum',
  transporte:  'ink',
  ingreso:     'olive',
  transfer:    'plum',
  general:     'ink',
};

export const hueForCategory = (cat) => HUE_BY_CATEGORY[cat?.toLowerCase()] || 'ink';

export const hueColorVar = (hue) => ({
  clay:  'var(--clay-500)',
  olive: 'var(--olive-500)',
  amber: 'var(--amber-300)',
  plum:  'var(--plum-400)',
  ink:   'var(--ink-700)',
}[hue] || 'var(--ink-400)');

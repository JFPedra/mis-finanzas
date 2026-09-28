import React, { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { formatCurrency } from '../../../shared/utils/format';
import { Icon, Card, Eyebrow, IconBtn, IconTile, ProgressBar } from '../../../shared/ds/Primitives';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function CategoriaDetalle({ categoryName, onBack }) {
  const { transactions, appConfig, currentContext } = useFinance();
  const today = useMemo(() => new Date(), []);
  const y = today.getFullYear();
  const m = today.getMonth();

  const catMeta = (appConfig?.categories || []).find(c => c.name === categoryName);
  const icon = catMeta?.icon || 'category';

  const matches = (t) => {
    if (t.type !== 'debit' || t.isTransfer) return false;
    if ((t.category || '') !== categoryName) return false;
    return currentContext === 'unified' ? true : t.context === currentContext;
  };

  // Current month — daily spending
  const { daily, monthTotal, daysWithSpend, daysInMonth } = useMemo(() => {
    const dim = new Date(y, m + 1, 0).getDate();
    const d = new Array(dim).fill(0);
    transactions.forEach(t => {
      if (!matches(t)) return;
      const dt = t.date instanceof Date ? t.date : new Date(t.date);
      if (dt.getFullYear() === y && dt.getMonth() === m) d[dt.getDate() - 1] += Number(t.amount) || 0;
    });
    return { daily: d, monthTotal: d.reduce((a, b) => a + b, 0), daysWithSpend: d.filter(v => v > 0).length, daysInMonth: dim };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categoryName, currentContext, y, m]);

  // Last 3 months comparison
  const comparison = useMemo(() => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const cm = m - i;
      const date = new Date(y, cm, 1);
      let total = 0;
      transactions.forEach(t => {
        if (!matches(t)) return;
        const dt = t.date instanceof Date ? t.date : new Date(t.date);
        if (dt.getFullYear() === date.getFullYear() && dt.getMonth() === date.getMonth()) total += Number(t.amount) || 0;
      });
      out.push({ label: capitalize(date.toLocaleDateString('es-CO', { month: 'long' })), total });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categoryName, currentContext, y, m]);

  const lastMonthTotal = comparison[1]?.total || 0;
  const delta = lastMonthTotal > 0 ? ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;
  const comparisonMax = Math.max(...comparison.map(c => c.total), 1);
  const maxDay = Math.max(...daily, 1);
  const monthName = capitalize(today.toLocaleDateString('es-CO', { month: 'long' }));

  // Heatmap grid — Monday-first, offset by weekday of day 1
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells = [
    ...Array(offset).fill(null),
    ...daily.map((v, i) => ({ day: i + 1, value: v })),
  ];

  return (
    <div className="animate-fade-up" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* In-screen header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px 10px', position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(14,17,22,0.9)', backdropFilter: 'blur(16px)',
      }}>
        <IconBtn icon="arrow_back" tone="sunken" onClick={onBack} title="Volver" />
        <div style={{ minWidth: 0 }}>
          <Eyebrow style={{ marginBottom: 2 }}>Categoría</Eyebrow>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg-1)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {categoryName || 'Categoría'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '6px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Card padding={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconTile icon={icon} hue="clay" size={30} />
              <Eyebrow>{monthName}</Eyebrow>
            </div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
              {formatCurrency(monthTotal, 'COP')}
            </div>
            {lastMonthTotal > 0 && (
              <div style={{ fontSize: 11, color: delta <= 0 ? 'var(--olive-600)' : 'var(--danger-700)', fontWeight: 700, marginTop: 2 }}>
                {delta <= 0 ? '↓' : '↑'} {Math.abs(delta).toFixed(0)}% vs. mes pasado
              </div>
            )}
          </Card>
          <Card padding={16}>
            <Eyebrow>Días con gasto</Eyebrow>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
              {daysWithSpend}<span style={{ fontSize: 13, opacity: 0.5, fontWeight: 500 }}>/{daysInMonth}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600, marginTop: 2 }}>
              {Math.round((daysWithSpend / daysInMonth) * 100)}% del mes
            </div>
          </Card>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2 md:items-start" style={{ display: 'grid' }}>
          {/* Heatmap */}
          <Card padding={18} style={{ borderRadius: 22 }}>
            <Eyebrow>{monthName} {y}</Eyebrow>
            <div style={{ marginTop: 4, marginBottom: 12, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-1)', fontWeight: 500 }}>
              Intensidad de gasto día a día.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 8 }}>
              {WEEKDAYS.map((l, i) => (
                <div key={i} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textAlign: 'center', color: i >= 5 ? 'var(--clay-600)' : 'var(--fg-3)' }}>{l}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {cells.map((c, i) => {
                if (c === null) return <div key={`e${i}`} />;
                const intensity = c.value / maxDay;
                const empty = c.value === 0;
                const isToday = c.day === today.getDate();
                return (
                  <div key={c.day} style={{
                    aspectRatio: '1 / 1', borderRadius: 8, position: 'relative', boxSizing: 'border-box',
                    background: empty ? 'var(--parchment-100)'
                      : `color-mix(in oklab, var(--clay-500) ${Math.max(15, intensity * 100)}%, var(--parchment-100))`,
                    border: isToday ? '2px solid var(--clay-400)' : 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: 4, left: 5, fontSize: 10, fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: intensity > 0.5 ? '#fff' : (empty ? 'var(--fg-4)' : 'var(--clay-700)'),
                    }}>{c.day}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', fontWeight: 600 }}>Menos</span>
              {[0.1, 0.3, 0.5, 0.75, 1].map((i, idx) => (
                <div key={idx} style={{
                  width: 12, height: 12, borderRadius: 3,
                  background: `color-mix(in oklab, var(--clay-500) ${i * 100}%, var(--parchment-100))`,
                }} />
              ))}
              <span style={{ fontSize: 10, color: 'var(--fg-3)', fontWeight: 600 }}>Más</span>
            </div>
          </Card>

          {/* Month comparison */}
          <Card padding={16}>
            <Eyebrow style={{ marginBottom: 12 }}>Comparación mes a mes</Eyebrow>
            {comparison.every(c => c.total === 0) ? (
              <div style={{ fontSize: 13, color: 'var(--fg-3)', textAlign: 'center', padding: '16px 0' }}>
                Sin gastos registrados en esta categoría.
              </div>
            ) : comparison.map((c, i) => (
              <div key={i} style={{ marginBottom: i < 2 ? 14 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-1)' }}>
                    {c.label}{i === 0 ? ' · en curso' : ''}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-1)', fontWeight: 700 }}>
                    {formatCurrency(c.total, 'COP')}
                  </span>
                </div>
                <ProgressBar
                  value={c.total} max={comparisonMax}
                  color={i === 0 ? 'var(--clay-500)' : 'var(--ink-300)'}
                  warningAt={2} height={6}
                />
              </div>
            ))}
          </Card>
        </div>

        {monthTotal === 0 && (
          <Card padding={20} style={{ textAlign: 'center' }}>
            <Icon name="insights" size={32} color="var(--fg-4)" />
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-3)' }}>
              No hay gastos de <strong>{categoryName}</strong> este mes.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

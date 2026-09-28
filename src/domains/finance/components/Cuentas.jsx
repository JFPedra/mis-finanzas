import React, { useEffect, useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { formatCurrency, formatCompactNumber } from '../../../shared/utils/format';
import {
  Icon, Card, Pill, IconTile, Eyebrow, Segmented, ProgressBar, SectionHeader,
} from '../../../shared/ds/Primitives';
import ContextSwitcher from './ContextSwitcher';
import {
  PRODUCT_TYPES, GRANULARITIES, GMF_RATE, isGmfEligible, gmfExemptUvt,
  buildPeriods, totalFlowsByPeriod, productFlowsByPeriod, gmfStatus, gmfMonthlyUsage, uvtFor,
} from '../utils/accountHelpers';

const IN_COLOR = 'var(--amber-300)';
const OUT_COLOR = 'var(--olive-400)';

const LEVEL_PILL = {
  ok:   { variant: 'success', label: 'Vas bien' },
  warn: { variant: 'warning', label: 'Cerca del tope' },
  over: { variant: 'danger',  label: 'Tope superado' },
};

const TABS = ['total', 'productos', 'gmf'];

const labelsFor = (type) => (type === 'credit'
  ? { in: 'Pagos a la tarjeta', out: 'Compras', net: 'Deuda del periodo' }
  : { in: 'Ingresos', out: 'Egresos', net: 'Neto' });

function Stat({ label, value, color, currency }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 6 }}>{label}</Eyebrow>
      <div style={{
        fontSize: 18, fontWeight: 800, color: color || 'var(--fg-1)', letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {formatCurrency(value, currency)}
      </div>
    </div>
  );
}

// Paired income/expense bars per period + a per-period table. Tapping a bar or
// row selects that period for the summary.
function PeriodHistory({ rows, currency, labels, selectedKey, onSelect, creditMode }) {
  const selected = rows.find(r => r.key === selectedKey) || rows[rows.length - 1];
  const max = Math.max(1, ...rows.map(r => Math.max(r.ingresos, r.egresos)));
  const withData = rows.filter(r => r.count > 0);
  const avgOut = withData.length ? withData.reduce((a, r) => a + r.egresos, 0) / withData.length : 0;
  const net = creditMode ? selected.egresos - selected.ingresos : selected.neto;

  return (
    <>
      <Card padding={18} style={{ borderRadius: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <Eyebrow>{selected.label}</Eyebrow>
          <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>
            {selected.count} movimiento{selected.count === 1 ? '' : 's'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
          {creditMode ? (
            <>
              <Stat label={labels.out} value={selected.egresos} color={OUT_COLOR} currency={currency} />
              <Stat label={labels.in} value={selected.ingresos} color={IN_COLOR} currency={currency} />
            </>
          ) : (
            <>
              <Stat label={labels.in} value={selected.ingresos} color={IN_COLOR} currency={currency} />
              <Stat label={labels.out} value={selected.egresos} color={OUT_COLOR} currency={currency} />
            </>
          )}
          <Stat
            label={labels.net}
            value={net}
            color={creditMode ? 'var(--fg-1)' : net >= 0 ? 'var(--success-500)' : 'var(--danger-500)'}
            currency={currency}
          />
        </div>
        {avgOut > 0 ? (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-3)' }}>
            Promedio de {labels.out.toLowerCase()} por periodo: <strong style={{ color: 'var(--fg-2)' }}>{formatCurrency(avgOut, currency)}</strong>
          </div>
        ) : null}

        {/* Chart */}
        <div style={{ marginTop: 18, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, minWidth: rows.length * 26 }}>
            {rows.map(r => {
              const active = r.key === selected.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onSelect(r.key)}
                  title={`${r.label}: ${formatCurrency(r.ingresos, currency)} / ${formatCurrency(r.egresos, currency)}`}
                  style={{
                    flex: 1, minWidth: 20, height: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 124, width: '100%', justifyContent: 'center', opacity: active ? 1 : 0.45 }}>
                    <div style={{ width: '42%', maxWidth: 14, height: Math.max(2, (r.ingresos / max) * 124), background: IN_COLOR, borderRadius: 3, transition: 'height var(--dur-slow) var(--ease-out)' }} />
                    <div style={{ width: '42%', maxWidth: 14, height: Math.max(2, (r.egresos / max) * 124), background: OUT_COLOR, borderRadius: 3, transition: 'height var(--dur-slow) var(--ease-out)' }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: active ? 800 : 600, color: active ? 'var(--fg-1)' : 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                    {r.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: IN_COLOR }} />{labels.in}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: OUT_COLOR }} />{labels.out}</span>
        </div>
      </Card>

      {/* Table */}
      <Card padding={0} style={{ borderRadius: 22, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--fg-3)',
        }}>
          <span>Periodo</span>
          <span style={{ textAlign: 'right' }}>{creditMode ? 'Compras' : 'Entra'}</span>
          <span style={{ textAlign: 'right' }}>{creditMode ? 'Pagos' : 'Sale'}</span>
          <span style={{ textAlign: 'right' }}>{creditMode ? 'Deuda' : 'Neto'}</span>
        </div>
        {[...rows].reverse().map(r => {
          const active = r.key === selected.key;
          const rowNet = creditMode ? r.egresos - r.ingresos : r.neto;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onSelect(r.key)}
              style={{
                display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, width: '100%',
                padding: '11px 16px', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                background: active ? 'var(--ink-50)' : 'transparent', textAlign: 'left',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--fg-2)',
              }}
            >
              <span style={{ fontWeight: active ? 800 : 600, color: 'var(--fg-1)' }}>{r.label}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{formatCompactNumber(creditMode ? r.egresos : r.ingresos)}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{formatCompactNumber(creditMode ? r.ingresos : r.egresos)}</span>
              <span style={{
                textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700,
                color: creditMode ? 'var(--fg-1)' : rowNet >= 0 ? 'var(--success-500)' : 'var(--danger-500)',
              }}>
                {rowNet < 0 ? '−' : ''}{formatCompactNumber(Math.abs(rowNet))}
              </span>
            </button>
          );
        })}
      </Card>
    </>
  );
}

function ProductChip({ product, active, onClick }) {
  const t = PRODUCT_TYPES[product.type];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 12px 7px 8px', borderRadius: 9999, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--clay-400)' : 'var(--border-default)'}`,
        background: active ? 'var(--bg-raised)' : 'transparent',
        color: active ? 'var(--fg-1)' : 'var(--fg-2)',
        fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: active ? 800 : 600,
      }}
    >
      <IconTile icon={t.icon} hue={t.hue} size={24} />
      {product.name}
    </button>
  );
}

function GmfCard({ product, status, onOpenProduct }) {
  const pill = LEVEL_PILL[status.level];
  const barColor = status.level === 'over' ? 'var(--danger-500)' : status.level === 'warn' ? 'var(--warning-500)' : 'var(--clay-400)';
  return (
    <Card padding={18} style={{ borderRadius: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <IconTile icon={PRODUCT_TYPES[product.type].icon} hue={PRODUCT_TYPES[product.type].hue} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            {PRODUCT_TYPES[product.type].short} · tope {formatCurrency(status.limit, 'COP')} · {status.source === 'manual' ? 'fijado a mano' : `${status.uvtCount} UVT`}
          </div>
        </div>
        <Pill variant={pill.variant}>{pill.label}</Pill>
      </div>

      <Eyebrow style={{ marginBottom: 6 }}>{status.remaining >= 0 ? 'Te quedan exentos' : 'Superaste el tope por'}</Eyebrow>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: status.remaining >= 0 ? 'var(--fg-1)' : 'var(--danger-500)' }}>
        {formatCurrency(Math.abs(status.remaining), 'COP')}
      </div>

      <div style={{ margin: '14px 0 8px', position: 'relative' }}>
        <ProgressBar value={status.used} max={status.limit || 1} color={barColor} warningAt={2} height={10} />
        {status.thresholds.map(t => (
          <span key={t} title={`Aviso al ${t}%`} style={{
            position: 'absolute', top: -3, left: `${Math.min(100, t)}%`, width: 2, height: 16,
            background: 'var(--fg-3)', opacity: 0.6, transform: 'translateX(-1px)',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--fg-3)', gap: 8 }}>
        <span>Movido {formatCurrency(status.used, 'COP')} ({status.pct.toFixed(0)}%)</span>
        <span>{status.daysLeft} día{status.daysLeft === 1 ? '' : 's'} para el corte</span>
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--fg-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="query_stats" size={16} color={status.projectedOver ? 'var(--warning-500)' : 'var(--fg-3)'} />
          <span>
            A este ritmo cerrarías el mes en <strong style={{ color: status.projectedOver ? 'var(--warning-500)' : 'var(--fg-1)' }}>{formatCurrency(status.projected, 'COP')}</strong>
            {status.projectedOver ? ', por encima del tope.' : '.'}
          </span>
        </div>
        {status.level === 'over' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="receipt" size={16} color="var(--danger-500)" />
            <span>4x1000 estimado sobre el exceso: <strong style={{ color: 'var(--danger-500)' }}>{formatCurrency(status.taxOnExcess, 'COP')}</strong></span>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={product.gmf.alertsEnabled ? 'notifications_active' : 'notifications_off'} size={16} color="var(--fg-3)" />
          <span>{product.gmf.alertsEnabled ? `Avisos al ${status.thresholds.join('%, ')}% y al superar el tope` : 'Avisos apagados'}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenProduct}
        style={{
          marginTop: 14, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--clay-400)', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 2,
        }}
      >
        Ver historial de la cuenta <Icon name="chevron_right" size={16} />
      </button>
    </Card>
  );
}

export default function Cuentas({ initialTab, onNavigate }) {
  const { transactions, products, appConfig, currentContext, loading } = useFinance();
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : 'total');
  const [gran, setGran] = useState('month');
  const [currency, setCurrency] = useState('COP');
  const [productName, setProductName] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);

  useEffect(() => { if (TABS.includes(initialTab)) setTab(initialTab); }, [initialTab]);

  const now = useMemo(() => new Date(), []);
  const periods = useMemo(() => buildPeriods(gran, now), [gran, now]);
  useEffect(() => { setSelectedKey(periods[periods.length - 1].key); }, [periods]);

  const currencies = useMemo(() => {
    const set = new Set(transactions.map(t => t.currency || 'COP'));
    return [...set].sort((a, b) => (a === 'COP' ? -1 : b === 'COP' ? 1 : a.localeCompare(b)));
  }, [transactions]);

  const product = products.find(p => p.name === productName) || products[0];

  const totalRows = useMemo(
    () => totalFlowsByPeriod(transactions, periods, gran, { currency, context: currentContext }),
    [transactions, periods, gran, currency, currentContext]);

  const productRows = useMemo(
    () => (product ? productFlowsByPeriod(transactions, product.name, periods, gran, { currency }) : []),
    [transactions, product, periods, gran, currency]);

  const selectedPeriod = periods.find(p => p.key === selectedKey) || periods[periods.length - 1];
  const byProduct = useMemo(() => products.map(p => {
    const [row] = productFlowsByPeriod(transactions, p.name, [selectedPeriod], gran, { currency });
    return { product: p, row };
  }).filter(x => x.row.count > 0), [products, transactions, selectedPeriod, gran, currency]);

  const uvtOverrides = appConfig?.uvtOverrides;
  const exempt = useMemo(() => products.filter(p => isGmfEligible(p.type) && p.gmf.exempt), [products]);
  const nonExempt = useMemo(() => products.filter(p => isGmfEligible(p.type) && !p.gmf.exempt), [products]);

  // La ley permite una cuenta de ahorros exenta por persona y un depósito de
  // bajo monto exento por entidad.
  const exemptWarnings = useMemo(() => {
    const out = [];
    const savings = exempt.filter(p => p.type === 'savings');
    if (savings.length > 1) out.push(`Tienes ${savings.length} cuentas de ahorros marcadas como exentas. La ley permite una sola por persona: revisa cuál registraste en el banco.`);
    const byBank = {};
    exempt.filter(p => p.type === 'lowvalue' && p.bank).forEach(p => {
      const k = p.bank.trim().toLowerCase();
      byBank[k] = [...(byBank[k] || []), p.name];
    });
    Object.values(byBank).filter(n => n.length > 1).forEach(names => {
      out.push(`${names.join(' y ')} son de la misma entidad. Solo un depósito de bajo monto por entidad puede ser exento.`);
    });
    return out;
  }, [exempt]);
  const gmf = useMemo(
    () => exempt.map(p => ({ product: p, status: gmfStatus(p, transactions, now, uvtOverrides) })),
    [exempt, transactions, now, uvtOverrides]);
  const uvt = uvtFor(now.getFullYear(), uvtOverrides);
  const monthName = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  const openProduct = (name) => { setProductName(name); setTab('productos'); };

  if (loading) return null;

  const periodControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Segmented
        size="sm"
        value={gran}
        onChange={setGran}
        options={Object.entries(GRANULARITIES).map(([value, g]) => ({ value, label: g.label }))}
      />
      {currencies.length > 1 ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {currencies.map(c => (
            <button
              key={c} type="button" onClick={() => setCurrency(c)}
              style={{
                padding: '4px 10px', borderRadius: 9999, cursor: 'pointer',
                border: `1px solid ${c === currency ? 'var(--clay-400)' : 'var(--border-default)'}`,
                background: 'transparent', color: c === currency ? 'var(--fg-1)' : 'var(--fg-3)',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              }}
            >{c}</button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <ContextSwitcher />
      <div className="animate-fade-up" style={{ maxWidth: 1000, margin: '0 auto', padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>Cuentas</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>Historial de lo que entra y sale, en total y por producto, y tu tope del 4x1000.</p>
        </div>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'total', label: 'Total' },
            { value: 'productos', label: 'Por producto' },
            { value: 'gmf', label: '4x1000' },
          ]}
        />

        {tab === 'total' && (
          <>
            {periodControls}
            <PeriodHistory
              rows={totalRows} currency={currency}
              labels={{ in: 'Ingresos', out: 'Egresos', net: 'Neto' }}
              selectedKey={selectedKey} onSelect={setSelectedKey}
            />
            <div style={{ fontSize: 11.5, color: 'var(--fg-4)', padding: '0 4px', lineHeight: 1.5 }}>
              El total no cuenta transferencias entre tus productos (pago de tarjeta, mover a ahorros): no son ingreso ni gasto.
            </div>
            {byProduct.length > 0 ? (
              <>
                <SectionHeader title="Por producto" eyebrow={selectedPeriod.label} />
                <Card padding={6} style={{ borderRadius: 22 }}>
                  {byProduct.map(({ product: p, row }) => {
                    const t = PRODUCT_TYPES[p.type];
                    return (
                      <button
                        key={p.name} type="button" onClick={() => openProduct(p.name)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 10px',
                          background: 'transparent', border: 'none', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                          fontFamily: 'var(--font-sans)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--ink-50)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <IconTile icon={t.icon} hue={t.hue} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.short}</div>
                        </div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                          {row.ingresos > 0 ? <div style={{ color: IN_COLOR }}>+{formatCompactNumber(row.ingresos)}</div> : null}
                          {row.egresos > 0 ? <div style={{ color: OUT_COLOR }}>−{formatCompactNumber(row.egresos)}</div> : null}
                        </div>
                        <Icon name="chevron_right" size={18} color="var(--fg-3)" />
                      </button>
                    );
                  })}
                </Card>
              </>
            ) : null}
          </>
        )}

        {tab === 'productos' && (
          products.length === 0 ? null : (
            <>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
                {products.map(p => (
                  <ProductChip key={p.name} product={p} active={p.name === product.name} onClick={() => setProductName(p.name)} />
                ))}
              </div>

              <Card padding={16} style={{ borderRadius: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconTile icon={PRODUCT_TYPES[product.type].icon} hue={PRODUCT_TYPES[product.type].hue} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg-1)' }}>{product.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                    {[PRODUCT_TYPES[product.type].label, product.bank, product.last4 ? `•••• ${product.last4}` : ''].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {product.gmf.exempt ? (
                  <button type="button" onClick={() => setTab('gmf')} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <Pill variant="olive" icon="receipt_long">Exenta 4x1000</Pill>
                  </button>
                ) : null}
              </Card>

              {periodControls}
              <PeriodHistory
                rows={productRows} currency={currency}
                labels={labelsFor(product.type)}
                creditMode={product.type === 'credit'}
                selectedKey={selectedKey} onSelect={setSelectedKey}
              />
              <div style={{ fontSize: 11.5, color: 'var(--fg-4)', padding: '0 4px', lineHeight: 1.5 }}>
                {product.type === 'credit'
                  ? 'Compras hechas con la tarjeta y pagos que le hiciste desde tus cuentas.'
                  : 'Incluye transferencias desde y hacia tus otros productos.'}
              </div>
            </>
          )
        )}

        {tab === 'gmf' && (
          <>
            <Card padding={20} style={{ background: 'var(--ink-800)', color: '#fff', borderRadius: 24 }}>
              <Eyebrow style={{ color: 'rgba(255,255,255,0.55)' }}>4x1000 · {monthName}</Eyebrow>
              <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Topes exentos por mes</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 4 }}>
                {['savings', 'lowvalue'].map(type => (
                  <div key={type}>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(Math.round(gmfExemptUvt(type) * uvt.value), 'COP')}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>
                      {PRODUCT_TYPES[type].label} · {gmfExemptUvt(type)} UVT
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                UVT {now.getFullYear()}: {formatCurrency(uvt.value, 'COP')}
                {uvt.source === 'oficial' ? ' (oficial DIAN)' : uvt.source === 'manual' ? ' (fijada a mano)' : ' (del último año conocido)'}.
                {' '}Solo cuentan las salidas de tus cuentas de ahorros y de bajo monto; lo que pase del tope paga 4 pesos por cada mil.
              </div>
            </Card>

            {gmf.length === 0 ? (
              <Card padding={20} style={{ borderRadius: 22, textAlign: 'center' }}>
                <Icon name="savings" size={40} color="var(--fg-3)" />
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: 'var(--fg-1)' }}>No tienes una cuenta marcada como exenta</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--fg-3)' }}>Márcala en Ajustes para ver cuánto te falta para el tope y recibir avisos.</div>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('settings', { tab: 'finance' })}
                  style={{
                    marginTop: 14, height: 38, padding: '0 16px', borderRadius: 'var(--r-lg)', border: 'none', cursor: 'pointer',
                    background: 'var(--clay-500)', color: '#fff', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5,
                  }}
                >
                  Configurar productos
                </button>
              </Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {gmf.map(({ product: p, status }) => (
                  <GmfCard key={p.name} product={p} status={status} onOpenProduct={() => openProduct(p.name)} />
                ))}
              </div>
            )}

            {exemptWarnings.map(msg => (
              <Card key={msg} padding={14} style={{ borderRadius: 18, borderLeft: '4px solid var(--warning-500)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>{msg}</div>
              </Card>
            ))}

            {nonExempt.length > 0 ? (
              <>
                <SectionHeader title="Cuentas sin exención" eyebrow="4x1000 estimado este mes" />
                <Card padding={6} style={{ borderRadius: 22 }}>
                  {nonExempt.map(p => {
                    const { used } = gmfMonthlyUsage(transactions, p.name, now);
                    return (
                      <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px' }}>
                        <IconTile icon={PRODUCT_TYPES[p.type].icon} hue="ink" size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>Movido {formatCurrency(used, 'COP')}</div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg-1)' }}>
                          {formatCurrency(used * GMF_RATE, 'COP')}
                        </span>
                      </div>
                    );
                  })}
                </Card>
              </>
            ) : null}

            <div style={{ fontSize: 11.5, color: 'var(--fg-4)', padding: '0 4px', lineHeight: 1.5 }}>
              Estimación con los movimientos registrados en la app: cuenta compras, retiros y transferencias que salen de la cuenta en el mes calendario. El banco puede excluir algunos movimientos.
            </div>
          </>
        )}
      </div>
    </>
  );
}

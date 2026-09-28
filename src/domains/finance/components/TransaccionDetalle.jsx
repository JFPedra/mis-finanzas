import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { formatCurrency } from '../../../shared/utils/format';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import { Icon, Card, Eyebrow, Pill, SectionHeader } from '../../../shared/ds/Primitives';

const CAT_ICONS = {
  food: 'restaurant', software: 'code', services: 'home_repair_service',
  salud: 'medical_services', transporte: 'directions_car',
};
const txIcon = (t) => {
  if (t.type === 'transfer' || t.isTransfer) return 'swap_horiz';
  if (t.type === 'credit') return 'trending_up';
  return CAT_ICONS[t.category] || 'payments';
};

const relativeTime = (date) => {
  const hours = Math.floor((Date.now() - date.getTime()) / 3600000);
  if (hours < 1) return 'Hace un momento';
  if (hours < 24) return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
};

export default function TransaccionDetalle({ txId, onBack, onEdit }) {
  const { transactions, addTransaction, deleteTransaction } = useFinance();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tx = useMemo(() => transactions.find(t => t.id === txId), [transactions, txId]);

  const stats = useMemo(() => {
    if (!tx) return { monthTotal: 0, visits: 0, avg: 0, pattern: [] };
    const now = new Date();
    const same = transactions.filter(t => (t.title || '') === tx.title && !t.isTransfer && t.type === tx.type);
    let monthTotal = 0, visits = 0, yearSum = 0;
    same.forEach(t => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      const amt = Number(t.amount) || 0;
      if (d.getFullYear() === now.getFullYear()) { visits += 1; yearSum += amt; }
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) monthTotal += amt;
    });
    // Last 6 months pattern
    const pattern = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      let total = 0;
      same.forEach(t => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        if (d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()) total += Number(t.amount) || 0;
      });
      pattern.push({ label: ref.toLocaleDateString('es-CO', { month: 'short' }).toUpperCase().replace('.', ''), total });
    }
    return { monthTotal, visits, avg: visits > 0 ? yearSum / visits : 0, pattern };
  }, [tx, transactions]);

  if (!tx) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-3)' }}>
        <Icon name="search_off" size={32} />
        <div style={{ marginTop: 10, fontSize: 14 }}>No se encontró la transacción.</div>
        <button
          type="button" onClick={onBack}
          style={{ marginTop: 16, border: 'none', background: 'var(--bg-sunken)', color: 'var(--fg-1)', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-sans)' }}
        >
          Volver
        </button>
      </div>
    );
  }

  const isTransfer = tx.type === 'transfer' || tx.isTransfer;
  const date = tx.date instanceof Date ? tx.date : new Date(tx.date);
  const sign = isTransfer ? '' : tx.type === 'credit' ? '+' : '−';
  const patternMax = Math.max(...stats.pattern.map(p => p.total), 1);

  const handleDuplicate = async () => {
    const { id: _id, date: _d, status: _s, ...rest } = tx;
    await addTransaction({ ...rest, status: 'reviewed' });
    onBack();
  };

  return (
    <div className="animate-fade-up" style={{ minHeight: '100%' }}>
      {/* Inky hero */}
      <div style={{ position: 'relative', background: 'var(--ink-800)', color: '#fff', padding: '16px 20px 70px' }}>
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.34) 0%, rgba(34,211,238,0) 65%)', pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <button
            type="button" onClick={onBack}
            style={{
              width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.1)',
              border: 'none', cursor: 'pointer', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="arrow_back" size={20} />
          </button>
          <Pill variant="clay" icon="schedule">{relativeTime(date)}</Pill>
        </div>

        <div style={{ marginTop: 20, position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 11px',
            borderRadius: 9999, background: 'rgba(255,255,255,0.1)', color: '#fff',
          }}>
            <Icon name={txIcon(tx)} size={14} />
            <span style={{ fontSize: 11, fontWeight: 700 }}>{tx.category || 'General'}</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
            {tx.title || tx.description || 'Transacción'}
          </div>
          <div style={{ marginTop: 4, fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
            {sign}{formatCurrency(Math.abs(tx.amount || 0), tx.currency || 'COP')}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{tx.card || tx.account || 'Efectivo'}
            {isTransfer && tx.destinationCard ? ` → ${tx.destinationCard}` : ''}
          </div>
        </div>
      </div>

      {/* Body — overlaps hero */}
      <div style={{
        maxWidth: 640, margin: '-50px auto 0', padding: '0 16px 24px',
        position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* Quick stats */}
        <Card padding={14} style={{ borderRadius: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {[
              { label: 'Total mes', value: formatCurrency(stats.monthTotal, 'COP') },
              { label: 'Visitas año', value: String(stats.visits) },
              { label: 'Promedio', value: formatCurrency(Math.round(stats.avg), 'COP') },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <div style={{ width: 1, background: 'var(--border-default)' }} />}
                <div style={{ textAlign: 'center', flex: 1, padding: '0 4px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--fg-1)' }}>{s.value}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </Card>

        {/* Note */}
        {tx.comments ? (
          <Card padding={14} style={{ borderRadius: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon name="chat" size={18} color="var(--fg-3)" style={{ marginTop: 2 }} />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5, fontStyle: 'italic' }}>
                {tx.comments}
              </div>
            </div>
          </Card>
        ) : null}

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { icon: 'edit', label: 'Editar', onClick: () => onEdit && onEdit(tx), danger: false },
            { icon: 'content_copy', label: 'Duplicar', onClick: handleDuplicate, danger: false },
            { icon: 'delete', label: 'Borrar', onClick: () => setConfirmDelete(true), danger: true },
          ].map(a => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              style={{
                padding: '14px 6px', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: a.danger ? 'var(--danger-50)' : 'var(--bg-sunken)',
                color: a.danger ? 'var(--danger-700)' : 'var(--fg-1)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700,
              }}
            >
              <Icon name={a.icon} size={22} />
              {a.label}
            </button>
          ))}
        </div>

        {/* Merchant pattern */}
        <div style={{ marginTop: 6 }}>
          <SectionHeader title="Patrón detectado" eyebrow={`${tx.title} · últimos 6 meses`} />
          <Card padding={16} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
              {stats.pattern.map((p, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '100%',
                    height: p.total === 0 ? 6 : Math.max(8, (p.total / patternMax) * 52),
                    background: i === 5 ? 'var(--clay-500)' : 'var(--parchment-200)',
                    borderRadius: 4,
                  }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--fg-3)', letterSpacing: '0.04em' }}>{p.label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5 }}>
              {stats.visits > 1
                ? <>Has registrado <strong style={{ color: 'var(--clay-600)' }}>{tx.title}</strong> {stats.visits} veces este año. Promedio {formatCurrency(Math.round(stats.avg), 'COP')}.</>
                : <>Primera vez que registras <strong style={{ color: 'var(--clay-600)' }}>{tx.title}</strong> este año.</>}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => { await deleteTransaction(tx.id); onBack(); }}
        title="Eliminar transacción"
        message="¿Estás seguro de que deseas eliminar esta transacción? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDestructive
      />
    </div>
  );
}

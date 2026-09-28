import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCompactNumber } from '../../../shared/utils/format';

// Acentos brillantes: se leen bien como línea sobre el fondo oscuro y con
// texto oscuro encima en el chip activo.
const CURRENCY_COLORS = {
  COP: 'var(--clay-400)',
  USD: 'var(--olive-400)',
  EUR: 'var(--amber-300)',
  DEFAULT: 'var(--plum-400)',
};

export default function BalanceChart({ dataPoints, currencies, selectedCurrency, onCurrencyChange }) {
  return (
    <>
      {currencies.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, justifyContent: 'flex-end' }}>
          {currencies.map(cur => {
            const color = CURRENCY_COLORS[cur] || CURRENCY_COLORS.DEFAULT;
            const active = cur === selectedCurrency;
            return (
              <button
                key={cur}
                type="button"
                onClick={() => onCurrencyChange(cur)}
                style={{
                  padding: '4px 10px', borderRadius: 9999, border: `1.5px solid ${color}`,
                  background: active ? color : 'transparent', color: active ? 'var(--ink-800)' : color,
                  fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                }}
              >{cur}</button>
            );
          })}
        </div>
      )}
      <div style={{ height: 200, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataPoints} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="date" stroke="var(--fg-4)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--fg-4)" fontSize={11} axisLine={false} tickLine={false} tickFormatter={v => formatCompactNumber(v)} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-raised)', boxShadow: 'var(--shadow-md)', fontFamily: 'var(--font-sans)' }}
              formatter={(val) => [formatCurrency(val, selectedCurrency || currencies[0]), 'Balance']}
              labelStyle={{ color: 'var(--fg-3)', fontWeight: 600, marginBottom: 4 }}
            />
            <Line
              type="monotone"
              dataKey={selectedCurrency || currencies[0]}
              stroke={CURRENCY_COLORS[selectedCurrency] || CURRENCY_COLORS.DEFAULT}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0, fill: CURRENCY_COLORS[selectedCurrency] || CURRENCY_COLORS.DEFAULT }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

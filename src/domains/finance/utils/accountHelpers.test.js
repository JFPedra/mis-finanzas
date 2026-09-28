import { describe, it, expect } from 'vitest';
import {
    inferProductType, productSlug, getProducts, normalizeThresholds,
    buildPeriods, periodKey, totalFlowsByPeriod, productFlowsByPeriod,
    uvtFor, gmfMonthlyLimit, gmfMonthlyUsage, gmfStatus,
} from './accountHelpers';

describe('inferProductType', () => {
    it('detects credit cards, cash and checking; defaults to savings', () => {
        expect(inferProductType('Tarjeta de Crédito Principal')).toBe('credit');
        expect(inferProductType('Visa Oro')).toBe('credit');
        expect(inferProductType('Efectivo')).toBe('cash');
        expect(inferProductType('Cuenta Corriente Davivienda')).toBe('checking');
        expect(inferProductType('Cuenta Bancaria')).toBe('savings');
    });
});

describe('productSlug', () => {
    it('strips accents and symbols', () => {
        expect(productSlug('Tarjeta de Crédito · Bancolombia')).toBe('tarjeta-de-credito-bancolombia');
    });
});

describe('normalizeThresholds', () => {
    it('keeps unique ints in (0,100], sorted', () => {
        expect(normalizeThresholds([95, '80', 80, 0, 150, 'x'])).toEqual([80, 95]);
    });
});

describe('getProducts', () => {
    it('derives products from legacy accounts', () => {
        const products = getProducts({ accounts: ['Efectivo', 'Visa'] });
        expect(products.map(p => [p.name, p.type])).toEqual([['Efectivo', 'cash'], ['Visa', 'credit']]);
    });

    it('merges stored metadata and keeps accounts order', () => {
        const products = getProducts({
            accounts: ['B', 'A'],
            products: [{ name: 'A', type: 'savings', bank: 'Banco', gmf: { exempt: true } }],
        });
        expect(products.map(p => p.name)).toEqual(['B', 'A']);
        expect(products[1].bank).toBe('Banco');
        expect(products[1].gmf.exempt).toBe(true);
        expect(products[1].gmf.thresholds).toEqual([80, 95]);
    });

    it('never marks non-savings products as GMF exempt', () => {
        const [card] = getProducts({ accounts: ['Visa'], products: [{ name: 'Visa', type: 'credit', gmf: { exempt: true } }] });
        expect(card.gmf.exempt).toBe(false);
    });
});

describe('buildPeriods / periodKey', () => {
    const now = new Date(2026, 8, 27); // 27 sep 2026

    it('builds the last 12 months ending on the current one', () => {
        const p = buildPeriods('month', now);
        expect(p).toHaveLength(12);
        expect(p[0].key).toBe('2025-10');
        expect(p[11].key).toBe('2026-09');
        expect(p[11].end.getDate()).toBe(30);
    });

    it('builds quarters, semesters and years', () => {
        expect(buildPeriods('quarter', now, 3).map(p => p.key)).toEqual(['2026-T1', '2026-T2', '2026-T3']);
        expect(buildPeriods('semester', now, 3).map(p => p.key)).toEqual(['2025-S2', '2026-S1', '2026-S2']);
        expect(buildPeriods('year', now, 2).map(p => p.key)).toEqual(['2025', '2026']);
    });

    it('keys a date into its period', () => {
        expect(periodKey(new Date(2026, 3, 1), 'quarter')).toBe('2026-T2');
        expect(periodKey(new Date(2026, 6, 1), 'semester')).toBe('2026-S2');
    });
});

const txs = [
    { type: 'credit', amount: 5000000, currency: 'COP', card: 'Ahorros', date: '2026-09-01', context: 'personal' },
    { type: 'debit', amount: 200000, currency: 'COP', card: 'Ahorros', date: '2026-09-03', context: 'personal' },
    { type: 'debit', amount: 300000, currency: 'COP', card: 'Visa', date: '2026-09-05', context: 'personal' },
    { type: 'transfer', amount: 300000, currency: 'COP', card: 'Ahorros', destinationCard: 'Visa', date: '2026-09-20', context: 'personal' },
    { type: 'debit', amount: 50, currency: 'USD', card: 'Ahorros', date: '2026-09-04', context: 'personal' },
    { type: 'debit', amount: 100000, currency: 'COP', card: 'Ahorros', date: '2026-08-15', context: 'personal' },
];

describe('totalFlowsByPeriod', () => {
    it('sums income/expense per period, excluding transfers and other currencies', () => {
        const periods = buildPeriods('month', new Date(2026, 8, 27), 2);
        const [aug, sep] = totalFlowsByPeriod(txs, periods, 'month');
        expect(sep.ingresos).toBe(5000000);
        expect(sep.egresos).toBe(500000);
        expect(sep.neto).toBe(4500000);
        expect(aug.egresos).toBe(100000);
    });

    it('groups by quarter', () => {
        const periods = buildPeriods('quarter', new Date(2026, 8, 27), 1);
        const [t3] = totalFlowsByPeriod(txs, periods, 'quarter');
        expect(t3.egresos).toBe(600000);
    });
});

describe('productFlowsByPeriod', () => {
    const periods = buildPeriods('month', new Date(2026, 8, 27), 1);

    it('counts transfers out of a savings account as outflows', () => {
        const [sep] = productFlowsByPeriod(txs, 'Ahorros', periods, 'month');
        expect(sep.ingresos).toBe(5000000);
        expect(sep.egresos).toBe(500000);
        expect(sep.transfOut).toBe(300000);
    });

    it('shows card purchases as outflows and card payments as inflows', () => {
        const [sep] = productFlowsByPeriod(txs, 'Visa', periods, 'month');
        expect(sep.egresos).toBe(300000);
        expect(sep.transfIn).toBe(300000);
    });
});

describe('GMF (4x1000)', () => {
    const product = { name: 'Ahorros', type: 'savings', gmf: { exempt: true, limitMode: 'uvt', thresholds: [80, 95] } };

    it('uses the official UVT and falls back to the latest known year', () => {
        expect(uvtFor(2026)).toEqual({ value: 52374, source: 'oficial' });
        expect(uvtFor(2027).source).toBe('estimada');
        expect(uvtFor(2026, { 2026: 60000 })).toEqual({ value: 60000, source: 'manual' });
    });

    it('computes 350 UVT as the monthly limit, or the manual override', () => {
        expect(gmfMonthlyLimit(product, 2026).limit).toBe(18330900);
        const manual = { ...product, gmf: { ...product.gmf, limitMode: 'manual', manualLimit: 10000000 } };
        expect(gmfMonthlyLimit(manual, 2026)).toEqual({ limit: 10000000, source: 'manual', uvt: null });
    });

    it('counts debits and transfers out in the month, COP only', () => {
        expect(gmfMonthlyUsage(txs, 'Ahorros', new Date(2026, 8, 10))).toEqual({ used: 500000, count: 2 });
    });

    it('reports warn/over levels against thresholds', () => {
        const big = [{ type: 'debit', amount: 15000000, currency: 'COP', card: 'Ahorros', date: '2026-09-02' }];
        const s = gmfStatus(product, big, new Date(2026, 8, 10));
        expect(s.level).toBe('warn');
        expect(s.crossed).toEqual([80]);
        expect(s.remaining).toBe(3330900);

        const over = [{ type: 'debit', amount: 20000000, currency: 'COP', card: 'Ahorros', date: '2026-09-02' }];
        const o = gmfStatus(product, over, new Date(2026, 8, 10));
        expect(o.level).toBe('over');
        expect(o.taxOnExcess).toBeCloseTo((20000000 - 18330900) * 0.004);
    });
});

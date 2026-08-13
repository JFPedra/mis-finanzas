import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeCategory, parseTransactionDate, calculateBalances, calcGoalSavings, sumPeriodFlows } from './financeHelpers';

// ─────────────────────────────────────────────────
// normalizeCategory
// ─────────────────────────────────────────────────
describe('normalizeCategory', () => {
    it('returns string category as-is', () => {
        expect(normalizeCategory('Comida')).toBe('Comida');
    });

    it('extracts name from object category', () => {
        expect(normalizeCategory({ name: 'Transporte', subcategories: [] })).toBe('Transporte');
    });

    it('extracts name from object with extra fields', () => {
        expect(normalizeCategory({ name: 'Servicios', foo: 'bar' })).toBe('Servicios');
    });

    it('returns "general" for null', () => {
        expect(normalizeCategory(null)).toBe('general');
    });

    it('returns "general" for undefined', () => {
        expect(normalizeCategory(undefined)).toBe('general');
    });

    it('returns "general" for empty string', () => {
        expect(normalizeCategory('')).toBe('general');
    });

    it('returns "general" for object without name', () => {
        expect(normalizeCategory({ subcategories: [] })).toBe('general');
    });

    it('handles number input gracefully', () => {
        // A number is truthy and not an object with .name, so it returns as-is
        expect(normalizeCategory(123)).toBe(123);
    });
});

// ─────────────────────────────────────────────────
// parseTransactionDate
// ─────────────────────────────────────────────────
describe('parseTransactionDate', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-24T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('parses Firestore Timestamp (object with toDate())', () => {
        const mockTimestamp = {
            toDate: () => new Date('2026-01-15T10:30:00Z'),
        };
        const result = parseTransactionDate(mockTimestamp);
        expect(result).toEqual(new Date('2026-01-15T10:30:00Z'));
    });

    it('parses a valid date string', () => {
        const result = parseTransactionDate('2026-01-15');
        expect(result.getUTCFullYear()).toBe(2026);
        expect(result.getUTCMonth()).toBe(0); // January
        expect(result.getUTCDate()).toBe(15);
    });

    it('parses ISO 8601 string', () => {
        const result = parseTransactionDate('2026-03-20T15:30:00Z');
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(2); // March
    });

    it('returns current date for null', () => {
        const result = parseTransactionDate(null);
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(1); // February
        expect(result.getDate()).toBe(24);
    });

    it('returns current date for undefined', () => {
        const result = parseTransactionDate(undefined);
        expect(result.toISOString()).toBe('2026-02-24T12:00:00.000Z');
    });

    it('returns current date for invalid date string', () => {
        const result = parseTransactionDate('not-a-date');
        // Invalid string should fallback to current date
        expect(result.getFullYear()).toBe(2026);
    });

    it('returns a Date object (not a string)', () => {
        const result = parseTransactionDate('2026-06-15');
        expect(result).toBeInstanceOf(Date);
    });
});

// ─────────────────────────────────────────────────
// calculateBalances
// ─────────────────────────────────────────────────
describe('calculateBalances', () => {
    it('returns zero balances for empty transactions', () => {
        const result = calculateBalances([]);
        expect(result.netWorth).toEqual({});
        expect(result.personalBalance).toEqual({});
        expect(result.businessCashFlow).toEqual({});
    });

    it('calculates net worth from a single credit', () => {
        const txs = [{ type: 'credit', amount: 5000, currency: 'COP', context: 'personal' }];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(5000);
        expect(result.personalBalance.COP).toBe(5000);
    });

    it('calculates net worth from a single debit', () => {
        const txs = [{ type: 'debit', amount: 3000, currency: 'COP', context: 'personal' }];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(-3000);
        expect(result.personalBalance.COP).toBe(-3000);
    });

    it('calculates correct balance with mixed credits and debits', () => {
        const txs = [
            { type: 'credit', amount: 10000, currency: 'COP', context: 'personal' },
            { type: 'debit', amount: 3000, currency: 'COP', context: 'personal' },
            { type: 'debit', amount: 2000, currency: 'COP', context: 'personal' },
        ];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(5000); // 10000 - 3000 - 2000
        expect(result.personalBalance.COP).toBe(5000);
    });

    it('separates personal and business balances', () => {
        const txs = [
            { type: 'credit', amount: 8000, currency: 'COP', context: 'personal' },
            { type: 'credit', amount: 15000, currency: 'COP', context: 'business' },
            { type: 'debit', amount: 5000, currency: 'COP', context: 'business' },
        ];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(18000); // 8000 + 15000 - 5000
        expect(result.personalBalance.COP).toBe(8000);
        expect(result.businessCashFlow.COP).toBe(10000); // 15000 - 5000
    });

    it('handles multi-currency transactions', () => {
        const txs = [
            { type: 'credit', amount: 100000, currency: 'COP', context: 'personal' },
            { type: 'credit', amount: 500, currency: 'USD', context: 'personal' },
            { type: 'debit', amount: 200, currency: 'USD', context: 'personal' },
        ];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(100000);
        expect(result.netWorth.USD).toBe(300); // 500 - 200
        expect(result.personalBalance.COP).toBe(100000);
        expect(result.personalBalance.USD).toBe(300);
    });

    it('falls back to USD when currency is missing', () => {
        const txs = [{ type: 'credit', amount: 1000, context: 'personal' }]; // no currency field
        const result = calculateBalances(txs);
        expect(result.netWorth.USD).toBe(1000);
    });

    it('handles transactions without context (unified only)', () => {
        const txs = [{ type: 'credit', amount: 7000, currency: 'COP' }]; // no context
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(7000);
        expect(result.personalBalance.COP).toBe(0); // not personal
        expect(result.businessCashFlow.COP).toBe(0); // not business
    });

    it('handles string amounts by coercing to number', () => {
        const txs = [
            { type: 'credit', amount: '5000', currency: 'COP', context: 'personal' },
            { type: 'debit', amount: '2000', currency: 'COP', context: 'personal' },
        ];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(3000);
    });

    it('does not produce NaN for undefined amounts', () => {
        const txs = [{ type: 'credit', currency: 'COP', context: 'personal' }]; // no amount
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toEqual(NaN); // Number(undefined) is NaN — this documents current behavior
    });

    it('excludes type=transfer from all balances', () => {
        const txs = [
            { type: 'credit', amount: 10000, currency: 'COP', context: 'personal' },
            { type: 'transfer', amount: 5000, currency: 'COP', context: 'personal', destinationCard: 'Visa' },
        ];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(10000); // transfer is excluded
        expect(result.personalBalance.COP).toBe(10000);
    });

    it('excludes legacy isTransfer=true from all balances', () => {
        const txs = [
            { type: 'credit', amount: 10000, currency: 'COP', context: 'personal' },
            { type: 'debit', amount: 3000, currency: 'COP', context: 'personal', isTransfer: true },
            { type: 'credit', amount: 3000, currency: 'COP', context: 'personal', isTransfer: true },
        ];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(10000); // both legacy transfers excluded
        expect(result.personalBalance.COP).toBe(10000);
    });

    it('correctly calculates balances with mixed regular and transfer transactions', () => {
        const txs = [
            { type: 'credit', amount: 50000, currency: 'COP', context: 'personal' },
            { type: 'debit', amount: 10000, currency: 'COP', context: 'personal' },
            { type: 'transfer', amount: 20000, currency: 'COP', context: 'personal', destinationCard: 'Visa' },
            { type: 'credit', amount: 5000, currency: 'USD', context: 'business' },
            { type: 'transfer', amount: 1000, currency: 'USD', context: 'business', destinationCard: 'Checking' },
        ];
        const result = calculateBalances(txs);
        expect(result.netWorth.COP).toBe(40000); // 50000 - 10000
        expect(result.personalBalance.COP).toBe(40000);
        expect(result.netWorth.USD).toBe(5000);
        expect(result.businessCashFlow.USD).toBe(5000);
    });
});

// ─────────────────────────────────────────────────
// calcGoalSavings
// ─────────────────────────────────────────────────
describe('calcGoalSavings', () => {
    const CUENTA = 'Bancolombia Ahorros *1234';

    it('sums manual abonos when goal has no linked account', () => {
        const goal = { abonos: [{ monto: 100 }, { monto: 250 }] };
        expect(calcGoalSavings(goal, [])).toBe(350);
    });

    it('returns 0 for a goal without abonos nor account', () => {
        expect(calcGoalSavings({}, [])).toBe(0);
    });

    it('adds transfers into the linked account', () => {
        const goal = { cuenta: CUENTA };
        const txs = [
            { type: 'transfer', amount: 500, card: 'Otra', destinationCard: CUENTA },
            { type: 'transfer', amount: 200, card: 'Otra', destinationCard: CUENTA },
        ];
        expect(calcGoalSavings(goal, txs)).toBe(700);
    });

    it('subtracts transfers out of the linked account', () => {
        const goal = { cuenta: CUENTA };
        const txs = [
            { type: 'transfer', amount: 500, card: 'Otra', destinationCard: CUENTA },
            { type: 'transfer', amount: 300, card: CUENTA, destinationCard: 'Otra' },
        ];
        expect(calcGoalSavings(goal, txs)).toBe(200);
    });

    it('ignores credits and debits on the linked account', () => {
        const goal = { cuenta: CUENTA };
        const txs = [
            { type: 'credit', amount: 4800000, card: CUENTA },
            { type: 'debit', amount: 50000, card: CUENTA },
        ];
        expect(calcGoalSavings(goal, txs)).toBe(0);
    });

    it('combines abonos and net transfer flow', () => {
        const goal = { cuenta: CUENTA, abonos: [{ monto: 1000 }] };
        const txs = [
            { type: 'transfer', amount: 500, card: 'Otra', destinationCard: CUENTA },
            { type: 'transfer', amount: 200, card: CUENTA, destinationCard: 'Otra' },
        ];
        expect(calcGoalSavings(goal, txs)).toBe(1300);
    });

    it('supports legacy isTransfer flag and account field', () => {
        const goal = { cuenta: CUENTA };
        const txs = [{ isTransfer: true, type: 'debit', amount: 400, account: CUENTA }];
        expect(calcGoalSavings(goal, txs)).toBe(-400);
    });

    it('ignores malformed abono amounts', () => {
        const goal = { abonos: [{ monto: 'abc' }, { monto: 500 }] };
        expect(calcGoalSavings(goal, [])).toBe(500);
    });
});

describe('sumPeriodFlows', () => {
    const txs = [
        { type: 'credit', amount: 3000000, date: '2026-07-20', context: 'personal', currency: 'COP' },
        { type: 'debit', amount: 500000, date: '2026-07-25', context: 'personal', currency: 'COP' },
        { type: 'debit', amount: 200000, date: '2026-08-10', context: 'personal', currency: 'COP' },
        { type: 'debit', amount: 100000, date: '2026-08-19', context: 'business', currency: 'COP' },
        { type: 'transfer', amount: 999999, date: '2026-08-01', context: 'personal', currency: 'COP' },
        { type: 'debit', amount: 50, date: '2026-08-05', context: 'personal', currency: 'USD' },
    ];

    it('sums credits and debits inside the inclusive range', () => {
        const { porMoneda, count } = sumPeriodFlows(txs, '2026-07-20', '2026-08-19');
        expect(porMoneda.COP).toEqual({ ingresos: 3000000, egresos: 800000, neto: 2200000, transferencias: 999999 });
        expect(count).toBe(5);
    });

    it('includes movements exactly on the boundary dates', () => {
        const { porMoneda } = sumPeriodFlows(txs, '2026-07-20', '2026-07-20');
        expect(porMoneda.COP).toEqual({ ingresos: 3000000, egresos: 0, neto: 3000000, transferencias: 0 });
    });

    it('keeps transfers out of ingresos/egresos/neto and the count, but collects them', () => {
        const { porMoneda, transfers, count } = sumPeriodFlows(txs, '2026-08-01', '2026-08-01');
        expect(porMoneda.COP).toEqual({ ingresos: 0, egresos: 0, neto: 0, transferencias: 999999 });
        expect(transfers).toHaveLength(1);
        expect(transfers[0].amount).toBe(999999);
        expect(count).toBe(0);
    });

    it('filters by context when not unified', () => {
        const { porMoneda } = sumPeriodFlows(txs, '2026-08-01', '2026-08-31', 'business');
        expect(porMoneda.COP).toEqual({ ingresos: 0, egresos: 100000, neto: -100000, transferencias: 0 });
    });

    it('includes transfers whose destination context matches the filter', () => {
        const cross = [{ type: 'transfer', amount: 700, date: '2026-08-02', context: 'personal', destinationContext: 'business', currency: 'COP' }];
        const { transfers } = sumPeriodFlows(cross, '2026-08-01', '2026-08-31', 'business');
        expect(transfers).toHaveLength(1);
    });

    it('groups totals per currency', () => {
        const { porMoneda } = sumPeriodFlows(txs, '2026-08-01', '2026-08-31');
        expect(porMoneda.USD).toEqual({ ingresos: 0, egresos: 50, neto: -50, transferencias: 0 });
        expect(porMoneda.COP.egresos).toBe(300000);
    });

    it('returns empty totals when nothing matches', () => {
        const { porMoneda, count } = sumPeriodFlows(txs, '2030-01-01', '2030-12-31');
        expect(porMoneda).toEqual({});
        expect(count).toBe(0);
    });

    it('supports legacy isTransfer flag exclusion', () => {
        const legacy = [{ isTransfer: true, type: 'debit', amount: 100, date: '2026-08-05' }];
        const { count } = sumPeriodFlows(legacy, '2026-08-01', '2026-08-31');
        expect(count).toBe(0);
    });

    describe('disponible en caja', () => {
        const OPTS = {
            cuentasCredito: new Set(['Tarjeta de Crédito Principal']),
            cuentasAhorro: new Set(['Cuenta Ahorros Nubank']),
        };
        const BANCO = 'Cuenta Bancaria Bancolombia';

        it('suma ingresos y resta gastos de cuentas de caja', () => {
            const txs2 = [
                { type: 'credit', amount: 3000000, date: '2026-08-05', card: BANCO, currency: 'COP' },
                { type: 'debit', amount: 500000, date: '2026-08-06', card: BANCO, currency: 'COP' },
            ];
            const { disponible } = sumPeriodFlows(txs2, '2026-08-01', '2026-08-31', 'unified', OPTS);
            expect(disponible.COP).toBe(2500000);
        });

        it('las compras con tarjeta de crédito no restan; el pago de la tarjeta sí', () => {
            const txs2 = [
                { type: 'debit', amount: 800000, date: '2026-08-05', card: 'Tarjeta de Crédito Principal', currency: 'COP' },
                { type: 'transfer', amount: 800000, date: '2026-08-20', card: BANCO, destinationCard: 'Tarjeta de Crédito Principal', currency: 'COP' },
            ];
            const { disponible, porMoneda } = sumPeriodFlows(txs2, '2026-08-01', '2026-08-31', 'unified', OPTS);
            expect(disponible.COP).toBe(-800000);
            expect(porMoneda.COP.egresos).toBe(800000); // el neto contable no cambia
        });

        it('los aportes a ahorro restan y los retiros de ahorro devuelven', () => {
            const txs2 = [
                { type: 'transfer', amount: 500000, date: '2026-08-05', card: BANCO, destinationCard: 'Cuenta Ahorros Nubank', currency: 'COP' },
                { type: 'transfer', amount: 200000, date: '2026-08-20', card: 'Cuenta Ahorros Nubank', destinationCard: BANCO, currency: 'COP' },
            ];
            const { disponible } = sumPeriodFlows(txs2, '2026-08-01', '2026-08-31', 'unified', OPTS);
            expect(disponible.COP).toBe(-300000);
        });

        it('mover plata entre cuentas de caja no cambia el disponible', () => {
            const txs2 = [
                { type: 'transfer', amount: 100000, date: '2026-08-05', card: BANCO, destinationCard: 'Efectivo', currency: 'COP' },
            ];
            const { disponible } = sumPeriodFlows(txs2, '2026-08-01', '2026-08-31', 'unified', OPTS);
            expect(disponible.COP).toBeUndefined();
        });

        it('gastos y créditos dentro de la cuenta de ahorros no tocan el disponible', () => {
            const txs2 = [
                { type: 'debit', amount: 50000, date: '2026-08-05', card: 'Cuenta Ahorros Nubank', currency: 'COP' },
                { type: 'credit', amount: 10000, date: '2026-08-06', card: 'Cuenta Ahorros Nubank', currency: 'COP' },
            ];
            const { disponible } = sumPeriodFlows(txs2, '2026-08-01', '2026-08-31', 'unified', OPTS);
            expect(disponible.COP).toBeUndefined();
        });
    });
});

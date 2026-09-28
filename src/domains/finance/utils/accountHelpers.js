import { parseTransactionDate } from './financeHelpers';

// ─────────────────────────────────────────────────
// Productos financieros
// ─────────────────────────────────────────────────

export const PRODUCT_TYPES = {
    savings:  { label: 'Cuenta de ahorros',  short: 'Ahorros',   icon: 'savings',         hue: 'olive' },
    checking: { label: 'Cuenta corriente',   short: 'Corriente', icon: 'account_balance', hue: 'ink' },
    credit:   { label: 'Tarjeta de crédito', short: 'Crédito',   icon: 'credit_card',     hue: 'plum' },
    cash:     { label: 'Efectivo',           short: 'Efectivo',  icon: 'payments',        hue: 'amber' },
};

export const DEFAULT_GMF_THRESHOLDS = [80, 95];

export const DEFAULT_GMF = {
    exempt: false,
    limitMode: 'uvt',
    manualLimit: null,
    alertsEnabled: true,
    thresholds: DEFAULT_GMF_THRESHOLDS,
};

/**
 * Guesses a product type from its name, for accounts created before products
 * had an explicit type. Unknown names default to savings (the usual bank
 * account in Colombia).
 */
export const inferProductType = (name = '') => {
    if (/cr[eé]dit|visa|master|amex/i.test(name)) return 'credit';
    if (/efectivo|cash/i.test(name)) return 'cash';
    if (/corriente/i.test(name)) return 'checking';
    return 'savings';
};

/**
 * Stable id derived from the name. The Python sync computes the same slug
 * (gmf.product_slug) to key alert state, so both must stay in sync.
 */
export const productSlug = (name = '') => name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const normalizeThresholds = (list) => {
    const clean = (Array.isArray(list) ? list : [])
        .map(Number)
        .filter(n => Number.isFinite(n) && n > 0 && n <= 100)
        .map(n => Math.round(n));
    return [...new Set(clean)].sort((a, b) => a - b);
};

export const normalizeProduct = (p) => {
    const type = PRODUCT_TYPES[p.type] ? p.type : inferProductType(p.name);
    const gmf = { ...DEFAULT_GMF, ...(p.gmf || {}) };
    gmf.thresholds = normalizeThresholds(gmf.thresholds);
    return {
        name: p.name,
        type,
        bank: p.bank || '',
        last4: p.last4 || '',
        gmf: type === 'savings' ? gmf : { ...DEFAULT_GMF, exempt: false },
    };
};

/**
 * Financial products from the settings doc. `accounts` (plain names) stays the
 * ordered source of truth because older code and the Python sync read it;
 * `products` adds type/bank/GMF metadata keyed by name. Accounts without
 * metadata get an inferred type.
 */
export const getProducts = (appConfig) => {
    const stored = Array.isArray(appConfig?.products) ? appConfig.products : [];
    const byName = new Map(stored.map(p => [p.name, p]));
    const accounts = Array.isArray(appConfig?.accounts) ? appConfig.accounts : [];
    const names = accounts.length ? accounts : stored.map(p => p.name);
    return names.map(name => normalizeProduct(byName.get(name) || { name }));
};

// ─────────────────────────────────────────────────
// Periodos (mensual / trimestral / semestral / anual)
// ─────────────────────────────────────────────────

export const GRANULARITIES = {
    month:    { label: 'Mensual',    months: 1,  count: 12 },
    quarter:  { label: 'Trimestral', months: 3,  count: 8 },
    semester: { label: 'Semestral',  months: 6,  count: 6 },
    year:     { label: 'Anual',      months: 12, count: 5 },
};

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const periodStart = (date, gran) => {
    const m = GRANULARITIES[gran].months;
    return new Date(date.getFullYear(), Math.floor(date.getMonth() / m) * m, 1);
};

export const periodKey = (date, gran) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    if (gran === 'month') return `${y}-${String(m + 1).padStart(2, '0')}`;
    if (gran === 'quarter') return `${y}-T${Math.floor(m / 3) + 1}`;
    if (gran === 'semester') return `${y}-S${Math.floor(m / 6) + 1}`;
    return `${y}`;
};

const periodLabels = (start, gran) => {
    const y = start.getFullYear();
    const yy = String(y).slice(-2);
    const m = start.getMonth();
    if (gran === 'month') return { label: `${MONTHS_SHORT[m]} ${y}`, short: MONTHS_SHORT[m] };
    if (gran === 'quarter') return { label: `T${Math.floor(m / 3) + 1} ${y}`, short: `T${Math.floor(m / 3) + 1}·${yy}` };
    if (gran === 'semester') return { label: `S${Math.floor(m / 6) + 1} ${y}`, short: `S${Math.floor(m / 6) + 1}·${yy}` };
    return { label: `${y}`, short: `${y}` };
};

/**
 * The last `count` periods up to (and including) the one containing `now`,
 * oldest first.
 */
export const buildPeriods = (gran, now = new Date(), count) => {
    const { months, count: defaultCount } = GRANULARITIES[gran];
    const n = count ?? defaultCount;
    const current = periodStart(now, gran);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const start = new Date(current.getFullYear(), current.getMonth() - i * months, 1);
        const end = new Date(start.getFullYear(), start.getMonth() + months, 0);
        out.push({ key: periodKey(start, gran), start, end, ...periodLabels(start, gran) });
    }
    return out;
};

const isTransfer = (t) => t.type === 'transfer' || t.isTransfer === true;
const originOf = (t) => t.card || t.account;

const emptyBucket = () => ({ ingresos: 0, egresos: 0, neto: 0, transfIn: 0, transfOut: 0, count: 0 });

const bucketize = (periods, gran, transactions, visit) => {
    const map = Object.fromEntries(periods.map(p => [p.key, emptyBucket()]));
    transactions.forEach((t) => {
        const bucket = map[periodKey(parseTransactionDate(t.date), gran)];
        if (bucket) visit(t, bucket, Number(t.amount) || 0);
    });
    return periods.map(p => ({ ...p, ...map[p.key] }));
};

/**
 * Income/expense per period across all products. Transfers are internal
 * movements (card payments, moving to savings) so they are left out.
 */
export const totalFlowsByPeriod = (transactions, periods, gran, { currency = 'COP', context = 'unified' } = {}) =>
    bucketize(periods, gran, transactions, (t, b, amount) => {
        if (isTransfer(t)) return;
        if ((t.currency || 'COP') !== currency) return;
        if (context !== 'unified' && t.context !== context) return;
        if (t.type === 'credit') { b.ingresos += amount; b.neto += amount; }
        else { b.egresos += amount; b.neto -= amount; }
        b.count += 1;
    });

/**
 * Money in/out of one product per period. Unlike the total view, transfers
 * count here: moving money into a savings account is income *for that
 * account*, and paying a credit card shows up as a payment into the card.
 */
export const productFlowsByPeriod = (transactions, productName, periods, gran, { currency = 'COP' } = {}) =>
    bucketize(periods, gran, transactions, (t, b, amount) => {
        if ((t.currency || 'COP') !== currency) return;
        const origin = originOf(t);
        if (isTransfer(t)) {
            if (t.destinationCard === productName) { b.ingresos += amount; b.transfIn += amount; b.neto += amount; b.count += 1; }
            if (origin === productName) { b.egresos += amount; b.transfOut += amount; b.neto -= amount; b.count += 1; }
            return;
        }
        if (origin !== productName) return;
        if (t.type === 'credit') { b.ingresos += amount; b.neto += amount; }
        else { b.egresos += amount; b.neto -= amount; }
        b.count += 1;
    });

// ─────────────────────────────────────────────────
// 4x1000 (Gravamen a los Movimientos Financieros)
// ─────────────────────────────────────────────────

// UVT oficial por año (DIAN). 2026: Resolución 000238 del 15-12-2025.
// Mantener en sync con UVT_BY_YEAR en gmf.py.
export const UVT_BY_YEAR = { 2024: 47065, 2025: 49799, 2026: 52374 };
export const GMF_EXEMPT_UVT = 350;
export const GMF_RATE = 0.004;

/**
 * UVT for a year: user override first, then the official table. For a year
 * not yet in the table it falls back to the latest known value and flags it.
 */
export const uvtFor = (year, overrides = {}) => {
    const override = Number(overrides?.[year]);
    if (override > 0) return { value: override, source: 'manual' };
    if (UVT_BY_YEAR[year]) return { value: UVT_BY_YEAR[year], source: 'oficial' };
    const known = Object.keys(UVT_BY_YEAR).map(Number).filter(y => y <= year).sort((a, b) => b - a);
    const fallbackYear = known[0] ?? Math.max(...Object.keys(UVT_BY_YEAR).map(Number));
    return { value: UVT_BY_YEAR[fallbackYear], source: 'estimada' };
};

export const gmfMonthlyLimit = (product, year, uvtOverrides = {}) => {
    const g = product?.gmf || DEFAULT_GMF;
    if (g.limitMode === 'manual' && Number(g.manualLimit) > 0) {
        return { limit: Number(g.manualLimit), source: 'manual', uvt: null };
    }
    const uvt = uvtFor(year, uvtOverrides);
    return { limit: Math.round(GMF_EXEMPT_UVT * uvt.value), source: uvt.source === 'estimada' ? 'uvt-estimada' : 'uvt', uvt: uvt.value };
};

/**
 * Withdrawals from a product in the calendar month of `monthDate` — what the
 * bank counts against the exemption: purchases/withdrawals and transfers out.
 * COP only (the exemption is in pesos).
 */
export const gmfMonthlyUsage = (transactions, productName, monthDate = new Date()) => {
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    let used = 0;
    let count = 0;
    transactions.forEach((t) => {
        if (originOf(t) !== productName) return;
        if (t.type === 'credit' && !isTransfer(t)) return;
        if ((t.currency || 'COP') !== 'COP') return;
        const d = parseTransactionDate(t.date);
        if (d.getFullYear() !== y || d.getMonth() !== m) return;
        used += Number(t.amount) || 0;
        count += 1;
    });
    return { used, count };
};

export const gmfStatus = (product, transactions, now = new Date(), uvtOverrides = {}) => {
    const { limit, source, uvt } = gmfMonthlyLimit(product, now.getFullYear(), uvtOverrides);
    const { used, count } = gmfMonthlyUsage(transactions, product.name, now);
    const remaining = limit - used;
    const pct = limit > 0 ? (used / limit) * 100 : 0;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const projected = dayOfMonth > 0 ? (used / dayOfMonth) * daysInMonth : used;
    const thresholds = product.gmf?.thresholds?.length ? product.gmf.thresholds : DEFAULT_GMF_THRESHOLDS;
    const level = used > limit ? 'over' : pct >= thresholds[0] ? 'warn' : 'ok';
    return {
        limit, source, uvt, used, count, remaining, pct,
        daysLeft: daysInMonth - dayOfMonth,
        projected,
        projectedOver: projected > limit,
        thresholds,
        crossed: thresholds.filter(t => pct >= t),
        level,
        taxOnExcess: Math.max(0, used - limit) * GMF_RATE,
    };
};

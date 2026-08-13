/**
 * Normalizes a category field that may be stored as a string or an object.
 * Handles the known Firestore inconsistency where category can be
 * {name: 'Comida', subcategories: []} instead of just 'Comida'.
 *
 * @param {string|object|null|undefined} category - The raw category value.
 * @returns {string} The normalized category name.
 */
export const normalizeCategory = (category) => {
    if (category && typeof category === 'object') {
        return category.name || 'general';
    }
    return category || 'general';
};

/**
 * Parses a transaction date field that can be:
 * 1. A Firestore Timestamp (has .toDate())
 * 2. A date string (parseable by new Date())
 * 3. null/undefined (falls back to current date)
 *
 * @param {object|string|null|undefined} dateField - The raw date value.
 * @returns {Date} A valid Date object.
 */
export const parseTransactionDate = (dateField) => {
    if (dateField && typeof dateField.toDate === 'function') {
        return dateField.toDate();
    }
    if (dateField) {
        // If the date is just a string 'YYYY-MM-DD', parse it safely at noon to avoid timezone shifts
        if (typeof dateField === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateField)) {
            const [year, month, day] = dateField.split('-');
            return new Date(year, month - 1, day, 12, 0, 0);
        }

        const parsed = new Date(dateField);
        // Guard against Invalid Date
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return new Date();
};

/**
 * Calculates multi-currency balances from a list of transactions.
 *
 * @param {Array<{type: string, amount: number, currency?: string, context?: string}>} transactions
 * @returns {{ netWorth: Object, personalBalance: Object, businessCashFlow: Object }}
 */
export const calculateBalances = (transactions) => {
    const netWorth = {};
    const personalBalance = {};
    const businessCashFlow = {};

    transactions.forEach((t) => {
        // Skip transfers — they move money between accounts, not in/out
        if (t.type === 'transfer' || t.isTransfer === true) return;

        const amount = t.type === 'credit' ? Number(t.amount) : -Number(t.amount);
        const currency = t.currency || 'USD';

        if (!netWorth[currency]) netWorth[currency] = 0;
        if (!personalBalance[currency]) personalBalance[currency] = 0;
        if (!businessCashFlow[currency]) businessCashFlow[currency] = 0;

        netWorth[currency] += amount;

        if (t.context === 'personal') {
            personalBalance[currency] += amount;
        } else if (t.context === 'business') {
            businessCashFlow[currency] += amount;
        }
    });

    return { netWorth, personalBalance, businessCashFlow };
};

/**
 * Calculates the saved amount for a savings goal.
 *
 * Savings = manual contributions (goal.abonos) + net transfer flow of the
 * linked account: transfers INTO goal.cuenta add, transfers OUT subtract.
 * Credits (e.g. salary deposits) are intentionally ignored — funding a goal
 * happens by moving money to its account or by recording an abono.
 *
 * @param {{cuenta?: string, abonos?: Array<{monto: number}>}} goal
 * @param {Array<object>} transactions
 * @returns {number} Amount saved (can be negative if more left than entered).
 */
/**
 * Shortens an account label for compact display by dropping the issuer prefix
 * (e.g. "Bancolombia Tarjeta Oro" → "Tarjeta Oro").
 *
 * @param {string|null|undefined} label
 * @returns {string}
 */
export const shortAccount = (label) => {
    if (!label) return 'Efectivo';
    const parts = label.trim().split(/\s+/);
    return parts.length > 2 ? parts.slice(-2).join(' ') : label;
};

/**
 * Sums income/expense flows within an inclusive date range.
 * Transfers (e.g. credit-card payments) don't count as income/expense — they
 * move money between accounts — but they are collected separately so the UI
 * can show them.
 *
 * Additionally computes "disponible en caja" — cash-basis flow of the liquid
 * accounts (everything that is not a credit card nor a savings account):
 *   + credits into cash accounts (salary)
 *   − debits paid from cash accounts
 *   − transfers from cash to a credit card (card payment) or savings (set aside)
 *   + transfers from savings back to cash (recovered)
 * Credit-card purchases don't subtract here — they subtract when the card is
 * paid — so nothing is counted twice.
 *
 * @param {Array<object>} transactions
 * @param {string} desde - Range start, 'YYYY-MM-DD' (inclusive).
 * @param {string} hasta - Range end, 'YYYY-MM-DD' (inclusive).
 * @param {string} [context='unified'] - 'personal' | 'business' | 'unified' (all).
 * @param {{cuentasCredito?: Set<string>, cuentasAhorro?: Set<string>}} [opts]
 * @returns {{porMoneda: Object<string, {ingresos: number, egresos: number, neto: number, transferencias: number}>, disponible: Object<string, number>, transfers: Array<object>, count: number}}
 */
export const sumPeriodFlows = (transactions, desde, hasta, context = 'unified', opts = {}) => {
    const cuentasCredito = opts.cuentasCredito || new Set();
    const cuentasAhorro = opts.cuentasAhorro || new Set();
    const esCredito = (acc) => cuentasCredito.has(acc);
    const esAhorro = (acc) => cuentasAhorro.has(acc);
    const esCaja = (acc) => !esCredito(acc) && !esAhorro(acc);

    const porMoneda = {};
    const disponible = {};
    const transfers = [];
    let count = 0;

    transactions.forEach((t) => {
        const esTransfer = t.type === 'transfer' || t.isTransfer === true;
        // A transfer belongs to the period view if either end touches the context
        if (context !== 'unified' && t.context !== context && !(esTransfer && t.destinationContext === context)) return;

        const d = parseTransactionDate(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if ((desde && key < desde) || (hasta && key > hasta)) return;

        const currency = t.currency || 'COP';
        if (!porMoneda[currency]) porMoneda[currency] = { ingresos: 0, egresos: 0, neto: 0, transferencias: 0 };

        const amount = Number(t.amount) || 0;
        const addDisponible = (delta) => { disponible[currency] = (disponible[currency] || 0) + delta; };

        if (esTransfer) {
            porMoneda[currency].transferencias += amount;
            transfers.push(t);
            const origen = t.card || t.account;
            const destino = t.destinationCard;
            if (esCaja(origen) && (esCredito(destino) || esAhorro(destino))) addDisponible(-amount);
            else if (esAhorro(origen) && esCaja(destino)) addDisponible(amount);
            return;
        }
        if (t.type === 'credit') {
            porMoneda[currency].ingresos += amount;
            porMoneda[currency].neto += amount;
            if (esCaja(t.card || t.account)) addDisponible(amount);
        } else {
            porMoneda[currency].egresos += amount;
            porMoneda[currency].neto -= amount;
            if (esCaja(t.card || t.account)) addDisponible(-amount);
        }
        count += 1;
    });

    return { porMoneda, disponible, transfers, count };
};

export const calcGoalSavings = (goal, transactions) => {
    const abonos = (goal.abonos || []).reduce((sum, a) => sum + (Number(a.monto) || 0), 0);
    if (!goal.cuenta) return abonos;

    let neto = 0;
    transactions.forEach((t) => {
        if (t.type !== 'transfer' && t.isTransfer !== true) return;
        const amount = Number(t.amount) || 0;
        if (t.destinationCard === goal.cuenta) neto += amount;
        if ((t.card || t.account) === goal.cuenta) neto -= amount;
    });
    return abonos + neto;
};

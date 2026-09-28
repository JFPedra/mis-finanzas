import React, { useMemo, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useFinance } from '../context/FinanceContext';
import { Icon, IconTile, Pill, Segmented } from '../shared/ds/Primitives';
import ConfirmModal from '../shared/components/ConfirmModal';
import { formatCurrency } from '../shared/utils/format';
import {
    PRODUCT_TYPES, DEFAULT_GMF, isGmfEligible, gmfExemptUvt,
    normalizeProduct, normalizeThresholds, normalizeSender, normalizeEmailSource,
    uvtFor, gmfMonthlyLimit, getEmailSources, getEmailSync,
} from '../domains/finance/utils/accountHelpers';

const CARD = {
    background: 'var(--bg-raised)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--r-2xl)',
    padding: 20,
};

const INPUT = {
    width: '100%', padding: '9px 12px',
    background: 'var(--bg-sunken)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--r-lg)',
    fontFamily: 'var(--font-sans)', fontSize: 13,
    color: 'var(--fg-1)', outline: 'none',
    boxSizing: 'border-box',
};

const LABEL = {
    fontSize: 11, fontWeight: 700, color: 'var(--fg-3)',
    letterSpacing: '0.06em', textTransform: 'uppercase',
};

const HINT = { fontSize: 11, color: 'var(--fg-4)', margin: '4px 0 0', lineHeight: 1.45 };

const ICON_BTN = (color) => ({
    width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'transparent', color, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const PRIMARY_BTN = (disabled) => ({
    height: 38, padding: '0 18px', borderRadius: 'var(--r-lg)', border: 'none',
    background: disabled ? 'var(--bg-sunken)' : 'var(--clay-500)',
    color: disabled ? 'var(--fg-4)' : '#fff',
    fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
});

const GHOST_BTN = {
    height: 38, padding: '0 14px', borderRadius: 'var(--r-lg)',
    border: '1px solid var(--border-default)', background: 'transparent',
    color: 'var(--fg-2)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
};

const FORM_BOX = {
    display: 'flex', flexDirection: 'column', gap: 14,
    padding: 16, borderRadius: 'var(--r-xl)',
    background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
};

const splitList = (text) => text.split(',').map(s => s.trim()).filter(Boolean);

function Toggle({ checked, onChange, label, hint }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%',
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-sans)',
            }}
        >
            <span style={{
                width: 38, height: 22, borderRadius: 9999, flexShrink: 0, position: 'relative', marginTop: 1,
                background: checked ? 'var(--clay-500)' : 'var(--ink-200)',
                transition: 'background var(--dur-fast) var(--ease-out)',
            }}>
                <span style={{
                    position: 'absolute', top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left var(--dur-fast) var(--ease-out)',
                }} />
            </span>
            {label ? (
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>{label}</span>
                    {hint ? <span style={{ display: 'block', ...HINT }}>{hint}</span> : null}
                </span>
            ) : null}
        </button>
    );
}

function Field({ label, children, hint }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <span style={LABEL}>{label}</span>
            {children}
            {hint ? <p style={HINT}>{hint}</p> : null}
        </div>
    );
}

// ─────────────────────────────────────────────────
// Productos
// ─────────────────────────────────────────────────

const emptyDraft = () => ({
    name: '', type: 'savings', principal: false, bank: '', last4: '', senders: [], hints: '',
    gmf: { ...DEFAULT_GMF },
    thresholdsText: DEFAULT_GMF.thresholds.join(', '),
});

const toDraft = (p) => ({
    ...p,
    senders: [...p.senders],
    gmf: { ...p.gmf },
    thresholdsText: (p.gmf?.thresholds || []).join(', '),
});

const TYPE_HINT = {
    savings: 'Cuenta de ahorros de un banco. Marca una como principal: es la cuenta por defecto para pagos de tarjeta y retiros cuando el correo no la aclara.',
    lowvalue: 'Depósito de bajo monto (Nequi, Daviplata…). Tiene su propio tope exento del 4x1000: 65 UVT al mes.',
    credit: 'Solo registra salidas (compras). Un pago a la tarjeta se guarda como transferencia desde tu cuenta de ahorros.',
    cash: 'Los retiros de cajero llegan como transferencia desde tu cuenta hacia aquí. Los gastos en efectivo se registran a mano.',
};

function ProductForm({ draft, setDraft, products, editingIndex, sources, uvtOverrides, onCancel, onSave, saving }) {
    const set = (patch) => setDraft(d => ({ ...d, ...patch }));
    const setGmf = (patch) => setDraft(d => ({ ...d, gmf: { ...d.gmf, ...patch } }));
    const toggleSender = (address) => setDraft(d => ({
        ...d,
        senders: d.senders.includes(address) ? d.senders.filter(s => s !== address) : [...d.senders, address],
    }));

    const year = new Date().getFullYear();
    const uvt = uvtFor(year, uvtOverrides);
    const auto = gmfMonthlyLimit({ type: draft.type, gmf: { limitMode: 'uvt' } }, year, uvtOverrides);

    const name = draft.name.trim();
    const isCash = draft.type === 'cash';
    const eligible = isGmfEligible(draft.type);
    const duplicate = products.some((p, i) => i !== editingIndex && p.name.toLowerCase() === name.toLowerCase());
    const badLast4 = draft.last4 && !/^\d{4}$/.test(draft.last4);
    const badManual = eligible && draft.gmf.exempt && draft.gmf.limitMode === 'manual' && !(Number(draft.gmf.manualLimit) > 0);
    const invalid = !name || duplicate || badLast4 || badManual;

    const otherExempt = products.some((p, i) => i !== editingIndex && p.gmf?.exempt && (
        draft.type === 'savings'
            ? p.type === 'savings'
            : p.type === 'lowvalue' && draft.bank.trim() && p.bank.trim().toLowerCase() === draft.bank.trim().toLowerCase()
    ));
    const exemptHint = otherExempt && draft.gmf.exempt
        ? (draft.type === 'savings'
            ? 'Ojo: ya tienes otra cuenta de ahorros exenta. La ley permite una sola por persona.'
            : 'Ojo: ya tienes otra cuenta de bajo monto exenta en esta entidad. La ley permite una sola por entidad.')
        : (draft.type === 'savings'
            ? 'La cuenta que registraste en el banco como exenta del gravamen.'
            : 'El depósito de bajo monto que la entidad tiene marcado como exento.');

    return (
        <div style={FORM_BOX}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg-1)' }}>
                {editingIndex === null ? 'Nuevo producto' : 'Editar producto'}
            </div>

            <Field label="Nombre">
                <input style={INPUT} value={draft.name} placeholder="Ej. Bancolombia Ahorros" onChange={e => set({ name: e.target.value })} autoFocus />
                {duplicate ? <p style={{ ...HINT, color: 'var(--danger-500)' }}>Ya existe un producto con ese nombre.</p> : null}
            </Field>

            <Field label="Tipo" hint={TYPE_HINT[draft.type]}>
                <Segmented
                    size="sm"
                    value={draft.type}
                    onChange={type => set({ type })}
                    options={Object.entries(PRODUCT_TYPES).map(([value, t]) => ({ value, label: t.short }))}
                />
            </Field>

            {draft.type === 'savings' ? (
                <Toggle
                    checked={draft.principal}
                    onChange={principal => set({ principal })}
                    label="Cuenta principal"
                    hint="Solo puede haber una; al marcar esta se desmarca la anterior."
                />
            ) : null}

            {!isCash ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--fg-2)' }}>Cómo lo identifica Gemini</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
                        <Field label="Banco">
                            <input style={INPUT} value={draft.bank} placeholder="Ej. Bancolombia" onChange={e => set({ bank: e.target.value })} />
                        </Field>
                        <Field label="Últimos 4">
                            <input
                                style={{ ...INPUT, fontFamily: 'var(--font-mono)' }}
                                value={draft.last4} placeholder="1234" inputMode="numeric" maxLength={4}
                                onChange={e => set({ last4: e.target.value.replace(/\D/g, '') })}
                            />
                        </Field>
                    </div>

                    <Field
                        label="Remitentes"
                        hint={sources.length
                            ? 'De qué remitentes pueden llegar los correos de este producto.'
                            : 'Primero agrega los remitentes de tu banco en "Correos del banco".'}
                    >
                        {sources.length ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {sources.map(s => {
                                    const on = draft.senders.includes(s.address);
                                    return (
                                        <button
                                            key={s.address} type="button" onClick={() => toggleSender(s.address)}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                padding: '5px 10px', borderRadius: 9999, cursor: 'pointer',
                                                border: `1px solid ${on ? 'var(--clay-400)' : 'var(--border-default)'}`,
                                                background: on ? 'var(--bg-raised)' : 'transparent',
                                                color: on ? 'var(--fg-1)' : 'var(--fg-3)',
                                                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: on ? 700 : 600,
                                            }}
                                        >
                                            <Icon name={on ? 'check_circle' : 'add_circle'} size={14} />
                                            {s.name || s.address}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </Field>

                    <Field
                        label="Cómo reconocerlo"
                        hint='Instrucción directa para Gemini. Ej: "Los correos dicen Cuenta de Ahorros *1234" o "Es la Visa, no la Mastercard".'
                    >
                        <textarea
                            style={{ ...INPUT, minHeight: 64, resize: 'vertical', lineHeight: 1.4 }}
                            value={draft.hints} placeholder="Opcional"
                            onChange={e => set({ hints: e.target.value })}
                        />
                    </Field>
                </div>
            ) : null}

            {eligible ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    <Toggle
                        checked={draft.gmf.exempt}
                        onChange={exempt => setGmf({ exempt })}
                        label="Exenta del 4x1000"
                        hint={exemptHint}
                    />

                    {draft.gmf.exempt ? (
                        <>
                            <Field label="Tope mensual exento">
                                <Segmented
                                    size="sm"
                                    value={draft.gmf.limitMode}
                                    onChange={limitMode => setGmf({ limitMode })}
                                    options={[{ value: 'uvt', label: 'Automático' }, { value: 'manual', label: 'Manual' }]}
                                />
                                {draft.gmf.limitMode === 'uvt' ? (
                                    <p style={HINT}>
                                        {gmfExemptUvt(draft.type)} UVT × {formatCurrency(uvt.value, 'COP')} = <strong style={{ color: 'var(--fg-2)' }}>{formatCurrency(auto.limit, 'COP')}</strong> ({year}
                                        {uvt.source === 'estimada' ? ', UVT del último año conocido — actualízala en "4x1000 · UVT"' : uvt.source === 'manual' ? ', UVT fijada a mano' : ', UVT oficial DIAN'}).
                                    </p>
                                ) : (
                                    <input
                                        style={{ ...INPUT, marginTop: 4 }}
                                        type="number" min="0" placeholder={String(auto.limit)}
                                        value={draft.gmf.manualLimit ?? ''}
                                        onChange={e => setGmf({ manualLimit: e.target.value === '' ? null : Number(e.target.value) })}
                                    />
                                )}
                            </Field>

                            <Toggle
                                checked={draft.gmf.alertsEnabled}
                                onChange={alertsEnabled => setGmf({ alertsEnabled })}
                                label="Avisarme cuando me acerque al tope"
                                hint="Llega como notificación push (actívalas en Yo → Cuenta → Avisos) y se muestra en Radiografía."
                            />
                            {draft.gmf.alertsEnabled ? (
                                <Field label="Avisar al llegar a (% del tope)" hint="Separados por coma. Al pasar el 100% siempre te avisamos.">
                                    <input style={INPUT} value={draft.thresholdsText} placeholder="80, 95" onChange={e => set({ thresholdsText: e.target.value })} />
                                </Field>
                            ) : null}
                        </>
                    ) : null}
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={onCancel} style={GHOST_BTN}>Cancelar</button>
                <button type="button" disabled={invalid || saving} onClick={onSave} style={PRIMARY_BTN(invalid || saving)}>
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>
        </div>
    );
}

export function ProductsSection() {
    const { products, saveProducts, transactions, appConfig } = useFinance();
    const [editingIndex, setEditingIndex] = useState(undefined); // undefined = closed, null = new
    const [draft, setDraft] = useState(emptyDraft);
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState(null);

    const sources = useMemo(() => getEmailSources(appConfig), [appConfig]);
    const sourceName = useMemo(() => Object.fromEntries(sources.map(s => [s.address, s.name || s.address])), [sources]);

    const usage = useMemo(() => {
        const m = {};
        transactions.forEach(t => {
            [t.card || t.account, t.destinationCard].forEach(n => { if (n) m[n] = (m[n] || 0) + 1; });
        });
        return m;
    }, [transactions]);

    const open = (index) => {
        setEditingIndex(index);
        setDraft(index === null ? { ...emptyDraft(), principal: !products.some(p => p.principal) } : toDraft(products[index]));
    };
    const close = () => setEditingIndex(undefined);

    const persist = async (next, renames) => {
        setSaving(true);
        try {
            await saveProducts(next, renames);
            close();
        } catch (e) {
            console.error('Error guardando productos:', e);
            alert('No se pudieron guardar los cambios. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
            setConfirm(null);
        }
    };

    const handleSave = () => {
        const product = normalizeProduct({
            name: draft.name.trim(),
            type: draft.type,
            principal: draft.principal,
            bank: draft.bank.trim(),
            last4: draft.last4,
            senders: draft.senders,
            hints: draft.hints.trim(),
            gmf: {
                ...draft.gmf,
                manualLimit: draft.gmf.manualLimit ? Number(draft.gmf.manualLimit) : null,
                thresholds: normalizeThresholds(draft.thresholdsText.split(/[,\s]+/)),
            },
        });
        let next = [...products];
        let renames = [];
        if (editingIndex === null) {
            next.push(product);
        } else {
            const prevName = products[editingIndex].name;
            next[editingIndex] = product;
            if (prevName !== product.name) renames = [{ from: prevName, to: product.name }];
        }
        if (product.principal) next = next.map(p => (p.name === product.name ? p : { ...p, principal: false }));

        const affected = renames.length ? (usage[renames[0].from] || 0) : 0;
        if (affected > 0) {
            setConfirm({
                title: 'Renombrar producto',
                message: `"${renames[0].from}" tiene ${affected} movimiento${affected === 1 ? '' : 's'}. Se actualizarán al nuevo nombre para conservar su historial.`,
                confirmText: 'Renombrar',
                onConfirm: () => persist(next, renames),
            });
            return;
        }
        persist(next, renames);
    };

    const handleDelete = (index) => {
        if (products.length === 1) { alert('Debes tener al menos un producto.'); return; }
        const p = products[index];
        const n = usage[p.name] || 0;
        setConfirm({
            title: 'Eliminar producto',
            message: n > 0
                ? `"${p.name}" tiene ${n} movimiento${n === 1 ? '' : 's'}. No se borran, pero dejarán de verse en el historial por producto.`
                : `¿Eliminar "${p.name}"?`,
            confirmText: 'Eliminar',
            isDestructive: true,
            onConfirm: () => persist(products.filter((_, i) => i !== index), []),
        });
    };

    const handleMoveUp = (index) => {
        if (index === 0) return;
        const next = [...products];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        persist(next, []);
    };

    const uvtOverrides = appConfig?.uvtOverrides || {};
    const formProps = { draft, setDraft, products, sources, uvtOverrides, onCancel: close, onSave: handleSave, saving };

    return (
        <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon name="account_balance_wallet" size={20} color="var(--clay-500)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--fg-1)', flex: 1 }}>Productos financieros</h3>
                {editingIndex === undefined ? (
                    <button type="button" onClick={() => open(null)} style={{ ...PRIMARY_BTN(false), height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="add" size={16} /> Agregar
                    </button>
                ) : null}
            </div>
            <p style={{ ...HINT, margin: '0 0 14px' }}>Cuentas de ahorros, de bajo monto, tarjetas de crédito y efectivo. El orden define la cuenta por defecto al registrar a mano.</p>

            {editingIndex === null ? (
                <div style={{ marginBottom: 12 }}>
                    <ProductForm {...formProps} editingIndex={null} />
                </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {products.map((p, idx) => {
                    if (editingIndex === idx) return <ProductForm key={p.name} {...formProps} editingIndex={idx} />;
                    const t = PRODUCT_TYPES[p.type];
                    const meta = [
                        t.label, p.bank, p.last4 ? `•••• ${p.last4}` : '',
                        p.senders.length ? p.senders.map(s => sourceName[s] || s).join(', ') : '',
                    ].filter(Boolean).join(' · ');
                    return (
                        <div key={p.name} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                            background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)',
                        }}>
                            <IconTile icon={t.icon} hue={t.hue} size={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {p.principal ? <Icon name="star" size={14} fill color="var(--amber-300)" /> : null}
                                    {p.name}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>
                            </div>
                            {p.gmf.exempt ? <Pill variant="olive">Exenta 4x1000</Pill> : null}
                            <div style={{ display: 'flex', gap: 2 }}>
                                <button type="button" title="Editar" onClick={() => open(idx)} disabled={saving || editingIndex !== undefined} style={ICON_BTN('var(--clay-400)')}>
                                    <Icon name="edit" size={15} />
                                </button>
                                {idx > 0 ? (
                                    <button type="button" title="Subir" onClick={() => handleMoveUp(idx)} disabled={saving || editingIndex !== undefined} style={ICON_BTN('var(--fg-3)')}>
                                        <Icon name="arrow_upward" size={15} />
                                    </button>
                                ) : null}
                                <button type="button" title="Eliminar" onClick={() => handleDelete(idx)} disabled={saving || editingIndex !== undefined} style={ICON_BTN('var(--danger-500)')}>
                                    <Icon name="delete" size={15} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <ConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                onConfirm={() => confirm?.onConfirm()}
                title={confirm?.title}
                message={confirm?.message}
                confirmText={confirm?.confirmText}
                isDestructive={confirm?.isDestructive}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────
// Correos del banco (qué correos lee el sync)
// ─────────────────────────────────────────────────

const SENDER_RE = /^([^\s@]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const timeAgo = (date) => {
    if (!date) return '';
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function SyncStatus({ sources }) {
    const [status, setStatus] = useState(null);
    useEffect(() => onSnapshot(
        doc(db, 'sync_status', 'latest'),
        snap => setStatus(snap.exists() ? snap.data() : null),
        () => setStatus(null),
    ), []);

    if (!status) {
        return <p style={{ ...HINT, marginTop: 0 }}>Aún no hay corridas registradas. El proceso corre a las 12:40 pm, 6:40 pm y 10:40 pm.</p>;
    }
    const lastRun = status.lastRunAt?.toDate ? status.lastRunAt.toDate() : null;
    const perSource = status.perSource || {};
    const errors = status.errors || [];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--fg-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name={errors.length ? 'error' : 'check_circle'} size={16} color={errors.length ? 'var(--warning-500)' : 'var(--success-500)'} />
                <span>
                    Última sincronización {timeAgo(lastRun)} · {status.processed || 0} correo{status.processed === 1 ? '' : 's'} nuevo{status.processed === 1 ? '' : 's'}
                </span>
            </div>
            {sources.length || status.labelCount != null ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {sources.map(s => (
                        <span key={s.address} style={{ padding: '3px 8px', borderRadius: 9999, background: 'var(--bg-sunken)', fontSize: 11, color: 'var(--fg-3)' }}>
                            {s.name || s.address}: {perSource[s.address] ?? 0}
                        </span>
                    ))}
                    {status.labelCount != null ? (
                        <span style={{ padding: '3px 8px', borderRadius: 9999, background: 'var(--bg-sunken)', fontSize: 11, color: 'var(--fg-3)' }}>
                            Etiqueta: {status.labelCount}
                        </span>
                    ) : null}
                </div>
            ) : null}
            {errors.map((e, i) => <div key={i} style={{ fontSize: 11.5, color: 'var(--warning-500)' }}>{e}</div>)}
        </div>
    );
}

export function EmailSourcesSection() {
    const { appConfig, patchAppConfig, products } = useFinance();
    const sources = useMemo(() => getEmailSources(appConfig), [appConfig]);
    const sync = getEmailSync(appConfig);

    const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, number = index
    const [draft, setDraft] = useState({ address: '', name: '', excludeText: '' });
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState(null);

    const [startDate, setStartDate] = useState(sync.startDate);
    const [useLabel, setUseLabel] = useState(sync.useLabel);
    const [label, setLabel] = useState(appConfig?.gmailLabel ?? '');
    useEffect(() => { setStartDate(sync.startDate); }, [sync.startDate]);
    useEffect(() => { setUseLabel(sync.useLabel); }, [sync.useLabel]);
    useEffect(() => { setLabel(appConfig?.gmailLabel ?? ''); }, [appConfig?.gmailLabel]);

    const run = async (patch) => {
        setSaving(true);
        try {
            await patchAppConfig(patch);
            return true;
        } catch (e) {
            console.error('Error guardando remitentes:', e);
            alert('No se pudieron guardar los cambios. Inténtalo de nuevo.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const open = (index) => {
        setEditing(index);
        const s = index === null ? { address: '', name: '', excludeSubjects: [] } : sources[index];
        setDraft({ address: s.address, name: s.name, excludeText: s.excludeSubjects.join(', ') });
    };

    const address = normalizeSender(draft.address);
    const duplicate = sources.some((s, i) => i !== editing && s.address === address);
    const invalid = !SENDER_RE.test(address) || duplicate;

    const saveSource = async () => {
        const source = normalizeEmailSource({ address, name: draft.name, excludeSubjects: splitList(draft.excludeText), enabled: editing === null ? true : sources[editing].enabled });
        const next = [...sources];
        const patch = {};
        if (editing === null) {
            next.push(source);
        } else {
            const prev = sources[editing].address;
            next[editing] = source;
            if (prev !== source.address) {
                patch.products = products.map(p => ({ ...p, senders: p.senders.map(s => (s === prev ? source.address : s)) }));
            }
        }
        patch.emailSources = next;
        if (!sync.startDate) patch.emailSync = { ...sync, startDate: todayStr() };
        if (await run(patch)) setEditing(undefined);
    };

    const toggleEnabled = (index) => {
        const next = sources.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s));
        run({ emailSources: next });
    };

    const remove = (index) => {
        const removed = sources[index];
        const used = products.filter(p => p.senders.includes(removed.address)).map(p => p.name);
        setConfirm({
            title: 'Quitar remitente',
            message: used.length
                ? `Se dejarán de leer sus correos y se quitará de: ${used.join(', ')}.`
                : `Se dejarán de leer los correos de ${removed.address}.`,
            onConfirm: () => run({
                emailSources: sources.filter((_, i) => i !== index),
                products: products.map(p => ({ ...p, senders: p.senders.filter(s => s !== removed.address) })),
            }),
        });
    };

    const saveGeneral = () => run({
        emailSync: { startDate, useLabel },
        gmailLabel: label.trim(),
    });

    return (
        <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon name="mail" size={20} color="var(--clay-500)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--fg-1)', flex: 1 }}>Correos del banco</h3>
                {editing === undefined ? (
                    <button type="button" onClick={() => open(null)} style={{ ...PRIMARY_BTN(false), height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="add" size={16} /> Remitente
                    </button>
                ) : null}
            </div>
            <p style={{ ...HINT, margin: '0 0 14px' }}>
                Tres veces al día (12:40 pm, 6:40 pm y 10:40 pm) el proceso busca en tu Gmail los correos de estos remitentes. Copia la dirección desde un correo de alerta del banco; también puedes poner solo el dominio (ej. banco.com.co).
            </p>

            {editing !== undefined ? (
                <div style={{ ...FORM_BOX, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg-1)' }}>{editing === null ? 'Nuevo remitente' : 'Editar remitente'}</div>
                    <Field label="Dirección o dominio">
                        <input style={{ ...INPUT, fontFamily: 'var(--font-mono)' }} value={draft.address} placeholder="alertas@banco.com.co" onChange={e => setDraft(d => ({ ...d, address: e.target.value }))} autoFocus />
                        {duplicate ? <p style={{ ...HINT, color: 'var(--danger-500)' }}>Ese remitente ya está en la lista.</p> : null}
                    </Field>
                    <Field label="Nombre">
                        <input style={INPUT} value={draft.name} placeholder="Ej. Bancolombia" onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                    </Field>
                    <Field label="Ignorar asuntos que contengan" hint="Separados por coma. Se descartan antes de llamar a Gemini (ahorra cuota). Los extractos ya se ignoran solos.">
                        <input style={INPUT} value={draft.excludeText} placeholder="promoción, oferta, beneficios" onChange={e => setDraft(d => ({ ...d, excludeText: e.target.value }))} />
                    </Field>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setEditing(undefined)} style={GHOST_BTN}>Cancelar</button>
                        <button type="button" disabled={invalid || saving} onClick={saveSource} style={PRIMARY_BTN(invalid || saving)}>
                            {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sources.length === 0 && editing === undefined ? (
                    <p style={{ fontSize: 12, color: 'var(--fg-4)', fontStyle: 'italic', textAlign: 'center', padding: '8px 0', margin: 0 }}>
                        Sin remitentes. Mientras tanto se usa solo la etiqueta de Gmail.
                    </p>
                ) : null}
                {sources.map((s, idx) => (
                    <div key={s.address} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                        background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)',
                        opacity: s.enabled ? 1 : 0.55,
                    }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>{s.name || s.address}</div>
                            <div style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</div>
                            {s.excludeSubjects.length ? (
                                <div style={{ fontSize: 11, color: 'var(--fg-4)' }}>Ignora: {s.excludeSubjects.join(', ')}</div>
                            ) : null}
                        </div>
                        <div title={s.enabled ? 'Activo' : 'Pausado'} style={{ width: 38 }}>
                            <Toggle checked={s.enabled} onChange={() => toggleEnabled(idx)} />
                        </div>
                        <button type="button" title="Editar" onClick={() => open(idx)} disabled={saving || editing !== undefined} style={ICON_BTN('var(--clay-400)')}>
                            <Icon name="edit" size={15} />
                        </button>
                        <button type="button" title="Quitar" onClick={() => remove(idx)} disabled={saving || editing !== undefined} style={ICON_BTN('var(--danger-500)')}>
                            <Icon name="delete" size={15} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                <Field label="Leer correos desde" hint="Los correos anteriores a esta fecha no se procesan. Se fija en hoy al agregar el primer remitente.">
                    <input type="date" style={INPUT} value={startDate} onChange={e => setStartDate(e.target.value)} />
                </Field>
                <Toggle
                    checked={useLabel}
                    onChange={setUseLabel}
                    label="También leer la etiqueta de Gmail"
                    hint="Útil como respaldo si el banco cambia de remitente. Los correos con la etiqueta se procesan y se les quita."
                />
                {useLabel ? (
                    <Field label="Etiqueta" hint="Vacío = Bancos/PendingBot.">
                        <input style={INPUT} value={label} placeholder="Bancos/PendingBot" onChange={e => setLabel(e.target.value)} />
                    </Field>
                ) : null}
                <button type="button" onClick={saveGeneral} disabled={saving} style={{ ...PRIMARY_BTN(saving), alignSelf: 'flex-start' }}>
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                <SyncStatus sources={sources} />
            </div>

            <ConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                onConfirm={() => confirm?.onConfirm()}
                title={confirm?.title}
                message={confirm?.message}
                confirmText="Quitar"
                isDestructive
            />
        </div>
    );
}

// ─────────────────────────────────────────────────
// UVT del año: viene de la tabla oficial; se puede fijar a mano cuando la DIAN
// publique un valor nuevo antes de que se actualice la app.
// ─────────────────────────────────────────────────
export function GmfConfigSection() {
    const { appConfig, patchAppConfig } = useFinance();
    const year = new Date().getFullYear();
    const overrides = appConfig?.uvtOverrides || {};
    const current = uvtFor(year, overrides);
    const official = uvtFor(year, {});
    const stored = overrides[year];
    const [value, setValue] = useState(stored ? String(stored) : '');
    const [saving, setSaving] = useState(false);

    useEffect(() => { setValue(stored ? String(stored) : ''); }, [stored]);

    const save = async () => {
        setSaving(true);
        try {
            const n = Number(value);
            const next = { ...overrides };
            if (n > 0) next[year] = n; else delete next[year];
            await patchAppConfig({ uvtOverrides: next });
        } catch (e) {
            console.error('Error guardando UVT:', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Icon name="receipt_long" size={20} color="var(--clay-500)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--fg-1)' }}>4x1000 · UVT</h3>
            </div>
            <Field
                label={`UVT ${year}`}
                hint={<>
                    {official.source === 'oficial'
                        ? `Valor oficial DIAN: ${formatCurrency(official.value, 'COP')}. Déjalo vacío para usarlo.`
                        : `Aún no tenemos la UVT oficial de ${year}; se usa ${formatCurrency(official.value, 'COP')} del último año conocido.`}
                    {' '}Topes automáticos: ahorros {gmfExemptUvt('savings')} UVT = <strong style={{ color: 'var(--fg-2)' }}>{formatCurrency(Math.round(gmfExemptUvt('savings') * current.value), 'COP')}</strong>;
                    {' '}bajo monto {gmfExemptUvt('lowvalue')} UVT = <strong style={{ color: 'var(--fg-2)' }}>{formatCurrency(Math.round(gmfExemptUvt('lowvalue') * current.value), 'COP')}</strong> al mes.
                </>}
            >
                <input
                    style={INPUT} type="number" min="0"
                    placeholder={official.source === 'oficial' ? String(official.value) : 'Valor publicado por la DIAN'}
                    value={value} onChange={e => setValue(e.target.value)}
                />
            </Field>
            <button type="button" onClick={save} disabled={saving} style={{ ...PRIMARY_BTN(saving), marginTop: 12 }}>
                {saving ? 'Guardando…' : 'Guardar'}
            </button>
        </div>
    );
}

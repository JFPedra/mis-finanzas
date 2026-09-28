import React, { useMemo, useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Icon, IconTile, Pill, Segmented } from '../shared/ds/Primitives';
import ConfirmModal from '../shared/components/ConfirmModal';
import { formatCurrency } from '../shared/utils/format';
import {
    PRODUCT_TYPES, DEFAULT_GMF, GMF_EXEMPT_UVT,
    normalizeProduct, normalizeThresholds, uvtFor, gmfMonthlyLimit,
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
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>{label}</span>
                {hint ? <span style={{ display: 'block', ...HINT }}>{hint}</span> : null}
            </span>
        </button>
    );
}

const emptyDraft = () => ({
    name: '', type: 'savings', bank: '', last4: '',
    gmf: { ...DEFAULT_GMF },
    thresholdsText: DEFAULT_GMF.thresholds.join(', '),
});

const toDraft = (p) => ({
    ...p,
    gmf: { ...p.gmf },
    thresholdsText: (p.gmf?.thresholds || []).join(', '),
});

function ProductForm({ draft, setDraft, products, editingIndex, uvtOverrides, onCancel, onSave, saving }) {
    const set = (patch) => setDraft(d => ({ ...d, ...patch }));
    const setGmf = (patch) => setDraft(d => ({ ...d, gmf: { ...d.gmf, ...patch } }));

    const year = new Date().getFullYear();
    const auto = gmfMonthlyLimit({ gmf: { limitMode: 'uvt' } }, year, uvtOverrides);
    const uvt = uvtFor(year, uvtOverrides);

    const name = draft.name.trim();
    const duplicate = products.some((p, i) => i !== editingIndex && p.name.toLowerCase() === name.toLowerCase());
    const badLast4 = draft.last4 && !/^\d{4}$/.test(draft.last4);
    const badManual = draft.type === 'savings' && draft.gmf.exempt && draft.gmf.limitMode === 'manual' && !(Number(draft.gmf.manualLimit) > 0);
    const otherExempt = products.some((p, i) => i !== editingIndex && p.type === 'savings' && p.gmf?.exempt);
    const invalid = !name || duplicate || badLast4 || badManual;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: 14,
            padding: 16, borderRadius: 'var(--r-xl)',
            background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
        }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg-1)' }}>
                {editingIndex === null ? 'Nuevo producto' : 'Editar producto'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={LABEL}>Nombre</span>
                <input style={INPUT} value={draft.name} placeholder="Ej. Bancolombia Ahorros" onChange={e => set({ name: e.target.value })} autoFocus />
                {duplicate ? <p style={{ ...HINT, color: 'var(--danger-500)' }}>Ya existe un producto con ese nombre.</p> : null}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={LABEL}>Tipo</span>
                <Segmented
                    size="sm"
                    value={draft.type}
                    onChange={type => set({ type })}
                    options={Object.entries(PRODUCT_TYPES).map(([value, t]) => ({ value, label: t.short }))}
                />
                {draft.type === 'credit' ? (
                    <p style={HINT}>En una tarjeta de crédito solo se registran salidas (compras). Los pagos a la tarjeta se guardan como transferencia desde tu cuenta.</p>
                ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                    <span style={LABEL}>Banco</span>
                    <input style={INPUT} value={draft.bank} placeholder="Opcional" onChange={e => set({ bank: e.target.value })} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={LABEL}>Últimos 4</span>
                    <input
                        style={{ ...INPUT, fontFamily: 'var(--font-mono)' }}
                        value={draft.last4} placeholder="1234" inputMode="numeric" maxLength={4}
                        onChange={e => set({ last4: e.target.value.replace(/\D/g, '') })}
                    />
                </div>
            </div>
            <p style={{ ...HINT, marginTop: -8 }}>
                Gemini usa el banco y los últimos 4 dígitos para asignar cada correo del banco a este producto.
            </p>

            {draft.type === 'savings' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    <Toggle
                        checked={draft.gmf.exempt}
                        onChange={exempt => setGmf({ exempt })}
                        label="Marcada como exenta del 4x1000"
                        hint={otherExempt && draft.gmf.exempt
                            ? 'Ojo: ya tienes otra cuenta exenta. La ley permite una sola por persona; el banco cobrará GMF en las demás.'
                            : 'La cuenta que registraste en el banco como exenta del gravamen (350 UVT al mes).'}
                    />

                    {draft.gmf.exempt ? (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={LABEL}>Tope mensual exento</span>
                                <Segmented
                                    size="sm"
                                    value={draft.gmf.limitMode}
                                    onChange={limitMode => setGmf({ limitMode })}
                                    options={[{ value: 'uvt', label: 'Automático' }, { value: 'manual', label: 'Manual' }]}
                                />
                                {draft.gmf.limitMode === 'uvt' ? (
                                    <p style={HINT}>
                                        {GMF_EXEMPT_UVT} UVT × {formatCurrency(uvt.value, 'COP')} = <strong style={{ color: 'var(--fg-2)' }}>{formatCurrency(auto.limit, 'COP')}</strong> ({year}
                                        {uvt.source === 'estimada' ? ', UVT del último año conocido — actualízala en "4x1000 · UVT"' : uvt.source === 'manual' ? ', UVT fijada a mano' : ', UVT oficial DIAN'}).
                                    </p>
                                ) : (
                                    <input
                                        style={{ ...INPUT, marginTop: 4 }}
                                        type="number" min="0" placeholder="Ej. 18330900"
                                        value={draft.gmf.manualLimit ?? ''}
                                        onChange={e => setGmf({ manualLimit: e.target.value === '' ? null : Number(e.target.value) })}
                                    />
                                )}
                            </div>

                            <Toggle
                                checked={draft.gmf.alertsEnabled}
                                onChange={alertsEnabled => setGmf({ alertsEnabled })}
                                label="Avisarme cuando me acerque al tope"
                                hint="Llega como notificación push (actívalas en Yo → Cuenta → Avisos) y se muestra en Radiografía."
                            />
                            {draft.gmf.alertsEnabled ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <span style={LABEL}>Avisar al llegar a (% del tope)</span>
                                    <input
                                        style={INPUT} value={draft.thresholdsText} placeholder="80, 95"
                                        onChange={e => set({ thresholdsText: e.target.value })}
                                    />
                                    <p style={HINT}>Separados por coma. Al pasar el 100% siempre te avisamos.</p>
                                </div>
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

    const usage = useMemo(() => {
        const m = {};
        transactions.forEach(t => {
            [t.card || t.account, t.destinationCard].forEach(n => { if (n) m[n] = (m[n] || 0) + 1; });
        });
        return m;
    }, [transactions]);

    const open = (index) => {
        setEditingIndex(index);
        setDraft(index === null ? emptyDraft() : toDraft(products[index]));
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
            bank: draft.bank.trim(),
            last4: draft.last4,
            gmf: {
                ...draft.gmf,
                manualLimit: draft.gmf.manualLimit ? Number(draft.gmf.manualLimit) : null,
                thresholds: normalizeThresholds(draft.thresholdsText.split(/[,\s]+/)),
            },
        });
        const next = [...products];
        let renames = [];
        if (editingIndex === null) {
            next.push(product);
        } else {
            const prevName = products[editingIndex].name;
            next[editingIndex] = product;
            if (prevName !== product.name) renames = [{ from: prevName, to: product.name }];
        }
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
            <p style={{ ...HINT, margin: '0 0 14px' }}>Cuentas de ahorro, tarjetas de crédito y efectivo. Aparecen al registrar movimientos y en Cuentas.</p>

            {editingIndex === null ? (
                <div style={{ marginBottom: 12 }}>
                    <ProductForm
                        draft={draft} setDraft={setDraft} products={products} editingIndex={null}
                        uvtOverrides={uvtOverrides} onCancel={close} onSave={handleSave} saving={saving}
                    />
                </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {products.map((p, idx) => {
                    if (editingIndex === idx) {
                        return (
                            <ProductForm
                                key={p.name}
                                draft={draft} setDraft={setDraft} products={products} editingIndex={idx}
                                uvtOverrides={uvtOverrides} onCancel={close} onSave={handleSave} saving={saving}
                            />
                        );
                    }
                    const t = PRODUCT_TYPES[p.type];
                    const meta = [t.label, p.bank, p.last4 ? `•••• ${p.last4}` : ''].filter(Boolean).join(' · ');
                    return (
                        <div key={p.name} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                            background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)',
                        }}>
                            <IconTile icon={t.icon} hue={t.hue} size={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>
                            </div>
                            {p.type === 'savings' && p.gmf.exempt ? <Pill variant="olive">Exenta 4x1000</Pill> : null}
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

// UVT del año: viene de la tabla oficial; se puede fijar a mano cuando la DIAN
// publique un valor nuevo antes de que se actualice la app.
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={LABEL}>UVT {year}</span>
                <input
                    style={INPUT} type="number" min="0"
                    placeholder={official.source === 'oficial' ? String(official.value) : 'Valor publicado por la DIAN'}
                    value={value} onChange={e => setValue(e.target.value)}
                />
                <p style={HINT}>
                    {official.source === 'oficial'
                        ? `Valor oficial DIAN: ${formatCurrency(official.value, 'COP')}. Déjalo vacío para usarlo.`
                        : `Aún no tenemos la UVT oficial de ${year}; se usa ${formatCurrency(official.value, 'COP')} del último año conocido.`}
                    {' '}Tope exento automático: {GMF_EXEMPT_UVT} UVT = <strong style={{ color: 'var(--fg-2)' }}>{formatCurrency(Math.round(GMF_EXEMPT_UVT * current.value), 'COP')}</strong> al mes.
                </p>
            </div>
            <button type="button" onClick={save} disabled={saving} style={{ ...PRIMARY_BTN(saving), marginTop: 12 }}>
                {saving ? 'Guardando…' : 'Guardar'}
            </button>
        </div>
    );
}

import React, { useState, useEffect, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Icon, Field } from '../../../shared/ds/Primitives';
import ConfirmModal from '../../../shared/components/ConfirmModal';

const INPUT_STYLE = {
    width: '100%', padding: '10px 14px',
    background: 'var(--bg-sunken)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--r-lg)',
    fontFamily: 'var(--font-sans)', fontSize: 14,
    color: 'var(--fg-1)', outline: 'none',
    boxSizing: 'border-box',
};

export default function PresupuestoModal({ isOpen, onClose, currentContext, currentMonthStr, editingCategory, onSaveConfig, onDeleteConfig }) {
    const { appConfig } = useFinance();
    const [confirmDelete, setConfirmDelete] = useState(false);

    const categories = useMemo(() => {
        if (!appConfig?.categories) return [];
        return appConfig.categories.map(c => typeof c === 'string' ? { name: c, subcategories: [] } : c);
    }, [appConfig]);

    const [formData, setFormData] = useState({
        nombre: categories?.[0]?.name || 'general',
        subcategory: '',
        limite: '',
    });

    useEffect(() => {
        if (editingCategory) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData({
                nombre: editingCategory.nombre || '',
                subcategory: editingCategory.subcategory || '',
                limite: editingCategory.limite || '',
            });
        } else {
            setFormData({
                nombre: categories?.[0]?.name || 'general',
                subcategory: '',
                limite: '',
            });
        }
    }, [editingCategory, categories]);

    const currentSubcategories = useMemo(() => {
        const cat = categories.find(c => c.name === formData.nombre);
        return cat ? cat.subcategories : [];
    }, [categories, formData.nombre]);

    if (!isOpen) return null;

    const isBusiness = currentContext === 'business';
    const accent = isBusiness ? 'var(--olive-500)' : 'var(--clay-500)';
    const accentShadow = isBusiness ? 'none' : 'var(--shadow-clay)';

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const catData = {
                nombre: formData.nombre,
                subcategory: formData.subcategory || null,
                limite: Number(formData.limite),
                color: isBusiness ? 'bg-secondary' : 'bg-primary',
                gastado: editingCategory?.gastado || 0,
            };
            await onSaveConfig(catData, editingCategory !== null);
            onClose();
        } catch (error) {
            console.error("Error managing category config:", error);
        }
    };

    return (
        <>
            <div
                style={{
                    position: 'fixed', inset: 0, zIndex: 90,
                    background: 'var(--bg-overlay)',
                    backdropFilter: 'blur(4px)',
                }}
                onClick={onClose}
            />
            <div style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 91,
                background: 'var(--bg-raised)',
                borderTopLeftRadius: 28, borderTopRightRadius: 28,
                boxShadow: 'var(--shadow-xl)',
                animation: 'sheetIn var(--dur-slow) var(--ease-out)',
                maxHeight: '90dvh',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Drag handle */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4, flexShrink: 0 }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-default)' }} />
                </div>

                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 20px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
                            {editingCategory ? 'Editar Límite' : 'Nuevo Presupuesto'}
                        </h2>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--fg-3)', fontWeight: 500 }}>
                            {currentMonthStr}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: 36, height: 36,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: 'var(--bg-sunken)', color: 'var(--fg-3)',
                        }}
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* Form */}
                <form
                    onSubmit={handleSubmit}
                    style={{ padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
                >
                    <Field label="Categoría">
                        {editingCategory ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <input disabled value={formData.nombre} style={{ ...INPUT_STYLE, color: 'var(--fg-3)', cursor: 'not-allowed' }} />
                                {formData.subcategory && (
                                    <input disabled value={`Sub: ${formData.subcategory}`} style={{ ...INPUT_STYLE, fontSize: 12, color: 'var(--fg-3)', cursor: 'not-allowed' }} />
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <select
                                    required
                                    value={formData.nombre}
                                    onChange={e => setFormData({ ...formData, nombre: e.target.value, subcategory: '' })}
                                    style={INPUT_STYLE}
                                >
                                    {categories.map(cat => (
                                        <option key={cat.name} value={cat.name}>{cat.name}</option>
                                    ))}
                                </select>

                                {currentSubcategories.length > 0 && (
                                    <div>
                                        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Subcategoría (Opcional)
                                        </p>
                                        <select
                                            value={formData.subcategory}
                                            onChange={e => setFormData({ ...formData, subcategory: e.target.value })}
                                            style={INPUT_STYLE}
                                        >
                                            <option value="">(Presupuesto general de la categoría)</option>
                                            {currentSubcategories.map(sub => (
                                                <option key={sub} value={sub}>{sub}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </Field>

                    <Field label="Límite mensual">
                        <div style={{ position: 'relative' }}>
                            <span style={{
                                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                                fontSize: 15, fontWeight: 700, color: 'var(--fg-3)',
                                fontFamily: 'var(--font-mono)',
                            }}>$</span>
                            <input
                                required
                                type="number"
                                placeholder="0"
                                value={formData.limite}
                                onChange={e => setFormData({ ...formData, limite: e.target.value })}
                                style={{ ...INPUT_STYLE, paddingLeft: 30, fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                            />
                        </div>
                    </Field>

                    <button
                        type="submit"
                        style={{
                            width: '100%', padding: '14px 20px',
                            borderRadius: 'var(--r-xl)', border: 'none',
                            background: accent, color: '#fff',
                            fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15,
                            cursor: 'pointer', marginTop: 4,
                            boxShadow: accentShadow,
                            transition: 'opacity var(--dur-fast) var(--ease-out)',
                        }}
                    >
                        Guardar Presupuesto
                    </button>

                    {editingCategory && onDeleteConfig && (
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            style={{
                                width: '100%', padding: '12px 20px',
                                borderRadius: 'var(--r-xl)', border: '1px solid var(--danger-200, rgba(239,68,68,0.35))',
                                background: 'transparent', color: 'var(--danger-700)',
                                fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14,
                                cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}
                        >
                            <Icon name="delete" size={18} />
                            Eliminar presupuesto
                        </button>
                    )}
                </form>
            </div>

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={async () => {
                    setConfirmDelete(false);
                    await onDeleteConfig();
                    onClose();
                }}
                title="Eliminar presupuesto"
                message={`Se quitará el límite de "${formData.nombre}${formData.subcategory ? ` › ${formData.subcategory}` : ''}" para este mes. Las transacciones no se tocan.`}
                confirmText="Eliminar"
                isDestructive
            />
        </>
    );
}

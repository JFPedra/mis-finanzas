import React, { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Icon, Field } from '../../../shared/ds/Primitives';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import { formatCurrency } from '../../../shared/utils/format';

const hoyStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const INPUT_STYLE = {
    width: '100%', padding: '10px 14px',
    background: 'var(--bg-sunken)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--r-lg)',
    fontFamily: 'var(--font-sans)', fontSize: 14,
    color: 'var(--fg-1)', outline: 'none',
    boxSizing: 'border-box',
};

export default function MetaModal({ isOpen, onClose, currentContext, editingMeta }) {
    const { addGoal, updateGoal, deleteGoal, appConfig } = useFinance();
    const [formData, setFormData] = useState({
        nombre: '',
        objetivo: '',
        cuenta: '',
        contexto: currentContext || 'personal',
        fechaObjetivo: '',
    });
    // Copia local de los abonos: se persiste al instante con updateGoal,
    // pero editingMeta es un snapshot y no se refresca hasta reabrir.
    const [abonos, setAbonos] = useState([]);
    const [abonoMonto, setAbonoMonto] = useState('');
    const [abonoNota, setAbonoNota] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (editingMeta) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData({
                nombre: editingMeta.nombre || '',
                objetivo: editingMeta.objetivo || '',
                cuenta: editingMeta.cuenta || '',
                contexto: editingMeta.contexto || currentContext || 'personal',
                fechaObjetivo: editingMeta.fechaObjetivo || '',
            });
            setAbonos(editingMeta.abonos || []);
        } else {
            setFormData({
                nombre: '',
                objetivo: '',
                cuenta: appConfig?.accounts?.[0] || '',
                contexto: currentContext === 'unified' ? 'personal' : (currentContext || 'personal'),
                fechaObjetivo: '',
            });
            setAbonos([]);
        }
        setAbonoMonto('');
        setAbonoNota('');
    }, [editingMeta, currentContext, appConfig, isOpen]);

    if (!isOpen) return null;

    const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));
    const esCompletada = editingMeta?.estado === 'completada';

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const dataToSave = {
                nombre: formData.nombre,
                objetivo: Number(formData.objetivo),
                cuenta: formData.cuenta,
                contexto: formData.contexto,
                fechaObjetivo: formData.fechaObjetivo || null,
            };
            if (editingMeta) {
                await updateGoal(editingMeta.id, dataToSave);
            } else {
                await addGoal(dataToSave);
            }
            onClose();
        } catch (error) {
            console.error("Error saving goal:", error);
        }
    };

    const addAbono = async () => {
        const monto = Number(abonoMonto);
        if (!editingMeta || !monto || monto <= 0) return;
        const updated = [...abonos, { id: String(Date.now()), monto, nota: abonoNota.trim(), fecha: hoyStr() }];
        setAbonos(updated);
        setAbonoMonto('');
        setAbonoNota('');
        try {
            await updateGoal(editingMeta.id, { abonos: updated });
        } catch (error) {
            console.error("Error saving abono:", error);
        }
    };

    const removeAbono = async (id) => {
        const updated = abonos.filter(a => a.id !== id);
        setAbonos(updated);
        try {
            await updateGoal(editingMeta.id, { abonos: updated });
        } catch (error) {
            console.error("Error removing abono:", error);
        }
    };

    const toggleCompletada = async () => {
        try {
            await updateGoal(editingMeta.id, esCompletada
                ? { estado: 'activa' }
                : { estado: 'completada', completadaEn: hoyStr() });
            onClose();
        } catch (error) {
            console.error("Error toggling goal state:", error);
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'var(--plum-50)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Icon name="track_changes" size={20} color="var(--plum-600)" />
                        </div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
                            {editingMeta ? 'Editar Meta' : 'Nueva Meta'}
                        </h2>
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
                    <Field label="Nombre de la meta">
                        <input
                            required
                            type="text"
                            placeholder="ej. Viaje a Japón"
                            value={formData.nombre}
                            onChange={e => set('nombre', e.target.value)}
                            style={INPUT_STYLE}
                        />
                    </Field>

                    <Field label="Objetivo final">
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
                                value={formData.objetivo}
                                onChange={e => set('objetivo', e.target.value)}
                                style={{ ...INPUT_STYLE, paddingLeft: 30, fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                            />
                        </div>
                    </Field>

                    <Field label="Cuenta vinculada">
                        <select
                            required
                            value={formData.cuenta}
                            onChange={e => set('cuenta', e.target.value)}
                            style={INPUT_STYLE}
                        >
                            <option value="">Selecciona una cuenta...</option>
                            {appConfig?.accounts?.map(acc => (
                                <option key={acc} value={acc}>{acc}</option>
                            ))}
                        </select>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--fg-4)', lineHeight: 1.4 }}>
                            Las transferencias hacia esta cuenta suman al progreso; las que salen de ella restan.
                        </p>
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Fecha objetivo · opcional">
                            <input
                                type="date"
                                value={formData.fechaObjetivo}
                                onChange={e => set('fechaObjetivo', e.target.value)}
                                style={INPUT_STYLE}
                            />
                        </Field>
                        <Field label="Contexto">
                            <select
                                value={formData.contexto}
                                onChange={e => set('contexto', e.target.value)}
                                style={INPUT_STYLE}
                            >
                                <option value="personal">Personal</option>
                                <option value="business">Negocio</option>
                            </select>
                        </Field>
                    </div>

                    {editingMeta && (
                        <Field label={`Abonos manuales${abonos.length > 0 ? ` (${abonos.length})` : ''}`}>
                            {abonos.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                                    {abonos.map(a => (
                                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{a.fecha}</span>
                                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {a.nota || 'Abono'}
                                            </span>
                                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--olive-600)', flexShrink: 0 }}>
                                                {formatCurrency(Number(a.monto) || 0, 'COP')}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeAbono(a.id)}
                                                aria-label="Eliminar abono"
                                                style={{ border: 'none', background: 'transparent', color: 'var(--fg-4)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                                            >
                                                <Icon name="close" size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    type="number" min="1" placeholder="Monto"
                                    value={abonoMonto}
                                    onChange={e => setAbonoMonto(e.target.value)}
                                    style={{ ...INPUT_STYLE, width: 110, fontFamily: 'var(--font-mono)' }}
                                />
                                <input
                                    type="text" placeholder="Nota (opcional)"
                                    value={abonoNota}
                                    onChange={e => setAbonoNota(e.target.value)}
                                    style={{ ...INPUT_STYLE, flex: 1, minWidth: 0 }}
                                />
                                <button
                                    type="button"
                                    onClick={addAbono}
                                    style={{
                                        padding: '0 16px', borderRadius: 'var(--r-lg)', border: 'none',
                                        background: 'var(--olive-500)', color: '#fff', cursor: 'pointer',
                                        fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13, flexShrink: 0,
                                    }}
                                >
                                    Abonar
                                </button>
                            </div>
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--fg-4)', lineHeight: 1.4 }}>
                                Los abonos se suman al progreso junto con las transferencias hacia la cuenta vinculada.
                            </p>
                        </Field>
                    )}

                    {editingMeta && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <button
                                type="button"
                                onClick={toggleCompletada}
                                style={{
                                    padding: '12px 10px', borderRadius: 'var(--r-lg)', cursor: 'pointer',
                                    border: '1px solid var(--olive-500)', background: 'var(--olive-50)',
                                    color: 'var(--olive-600)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13,
                                }}
                            >
                                {esCompletada ? 'Reactivar meta' : 'Marcar completada'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(true)}
                                style={{
                                    padding: '12px 10px', borderRadius: 'var(--r-lg)', cursor: 'pointer',
                                    border: 'none', background: 'var(--danger-50)',
                                    color: 'var(--danger-700)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13,
                                }}
                            >
                                Eliminar meta
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        style={{
                            width: '100%', padding: '14px 20px',
                            borderRadius: 'var(--r-xl)', border: 'none',
                            background: 'var(--plum-500)', color: '#fff',
                            fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15,
                            cursor: 'pointer', marginTop: 4,
                            boxShadow: '0 4px 16px -4px rgba(162, 28, 175, 0.45)',
                            transition: 'opacity var(--dur-fast) var(--ease-out)',
                        }}
                    >
                        Guardar Meta
                    </button>
                </form>
            </div>

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={async () => {
                    await deleteGoal(editingMeta.id);
                    setConfirmDelete(false);
                    onClose();
                }}
                title="Eliminar meta"
                message={`¿Eliminar la meta "${editingMeta?.nombre}"? Sus abonos manuales se pierden; las transferencias no se tocan.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                isDestructive
            />
        </>
    );
}

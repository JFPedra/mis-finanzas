import React from 'react';
import { Icon } from '../ds/Primitives';

export default function ConfirmModal({
    isOpen, onClose, onConfirm,
    title, message,
    confirmText = 'Confirmar', cancelText = 'Cancelar',
    isDestructive = false
}) {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
                background: 'var(--bg-overlay)',
                backdropFilter: 'blur(4px)',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-2xl)',
                padding: '28px 24px 24px',
                width: '100%', maxWidth: 360,
                boxShadow: 'var(--shadow-lg)',
                animation: 'fadeUp var(--dur-slow) var(--ease-out)',
                position: 'relative',
            }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: 14, right: 14,
                        width: 32, height: 32,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'transparent', color: 'var(--fg-3)',
                        transition: 'background var(--dur-fast) var(--ease-out)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <Icon name="close" size={18} />
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 16,
                        background: isDestructive ? 'var(--danger-50)' : 'var(--clay-50)',
                        color: isDestructive ? 'var(--danger-700)' : 'var(--clay-600)',
                    }}>
                        <Icon name={isDestructive ? 'delete' : 'info'} size={26} />
                    </div>

                    <h3 style={{
                        margin: '0 0 8px', fontSize: 17, fontWeight: 800,
                        color: 'var(--fg-1)', letterSpacing: '-0.01em',
                    }}>{title}</h3>
                    <p style={{
                        margin: '0 0 24px', fontSize: 13, color: 'var(--fg-3)',
                        lineHeight: 1.55, maxWidth: 280,
                    }}>{message}</p>

                    <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                        <button
                            onClick={onClose}
                            style={{
                                flex: 1, padding: '11px 16px',
                                borderRadius: 12, border: '1px solid var(--border-default)',
                                background: 'var(--bg-raised)', color: 'var(--fg-2)',
                                fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14,
                                cursor: 'pointer',
                                transition: 'background var(--dur-fast) var(--ease-out)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-raised)'}
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => { onConfirm(); onClose(); }}
                            style={{
                                flex: 1, padding: '11px 16px',
                                borderRadius: 12, border: 'none',
                                background: isDestructive ? 'var(--danger-600)' : 'var(--clay-500)',
                                color: '#fff',
                                fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14,
                                cursor: 'pointer',
                                boxShadow: isDestructive ? 'none' : 'var(--shadow-clay)',
                            }}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

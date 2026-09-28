import React from 'react';
import { Icon } from '../ds/Primitives';
import { useAuth } from '../../context/AuthContext';

const RailItem = ({ icon, active, onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    style={{
      width: 44, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'var(--clay-50)' : 'transparent',
      color: active ? 'var(--clay-600)' : 'var(--fg-3)',
      transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
      position: 'relative',
    }}
    onMouseEnter={e => {
      if (!active) {
        e.currentTarget.style.background = 'var(--ink-50)';
        e.currentTarget.style.color = 'var(--fg-1)';
      }
    }}
    onMouseLeave={e => {
      if (!active) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--fg-3)';
      }
    }}
  >
    {active && (
      <span style={{
        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
        width: 3, height: 20, borderRadius: '0 2px 2px 0',
        background: 'var(--clay-500)',
      }} />
    )}
    <Icon name={icon} size={22} fill={active} />
  </button>
);

const Divider = () => (
  <div style={{ width: 28, height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
);

export default function Sidebar({ activeView, onNavigate }) {
  const { logout } = useAuth();

  return (
    <nav style={{
      width: 'var(--rail-w)',
      height: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '16px 0',
      background: 'var(--bg-raised)',
      borderRight: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      {/* Logo mark — PWA app icon */}
      <img
        src="/icons/icon-192.png"
        alt="Mis Finanzas"
        width={36}
        height={36}
        style={{ borderRadius: 11, marginBottom: 16, display: 'block' }}
      />

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, alignItems: 'center', overflowY: 'auto' }}>
        <RailItem icon="insights"     title="Radiografía"  active={activeView === 'insights'}     onClick={() => onNavigate('insights')} />
        <RailItem icon="receipt_long" title="Movimientos"  active={activeView === 'transactions'} onClick={() => onNavigate('transactions')} />
        <RailItem icon="account_balance_wallet" title="Cuentas" active={activeView === 'cuentas'} onClick={() => onNavigate('cuentas')} />
        <RailItem icon="savings"      title="Presupuestos" active={activeView === 'presupuestos'} onClick={() => onNavigate('presupuestos')} />

        <Divider />

        <RailItem icon="settings" title="Ajustes" active={activeView === 'settings'} onClick={() => onNavigate('settings')} />
      </div>

      {/* Logout at bottom */}
      <button
        type="button"
        onClick={logout}
        title="Cerrar sesión"
        style={{
          width: 44, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--fg-4)',
          transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-50)'; e.currentTarget.style.color = 'var(--danger-700)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-4)'; }}
      >
        <Icon name="logout" size={20} />
      </button>
    </nav>
  );
}

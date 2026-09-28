import React from 'react';

export default function Header() {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'rgba(14, 17, 22, 0.82)',
      backdropFilter: 'blur(20px) saturate(140%)',
      WebkitBackdropFilter: 'blur(20px) saturate(140%)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
      }}>
        {/* Logo mark — PWA app icon */}
        <img
          src="/icons/icon-192.png"
          alt="Mis Finanzas"
          width={34}
          height={34}
          style={{ borderRadius: 10, flexShrink: 0, display: 'block' }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--fg-1)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
            Mis Finanzas
          </div>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--fg-4)', marginTop: 1,
          }}>
            Dashboard personal
          </div>
        </div>
      </div>
    </header>
  );
}

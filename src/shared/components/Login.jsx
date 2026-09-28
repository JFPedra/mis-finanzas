import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Icon, Editorial, IconTile, Pill, ProgressBar, SparkLine } from '../ds/Primitives';

export default function Login() {
  const { loginWithGoogle, loginError } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (loginError) {
      setError(loginError);
      setLoading(false);
    }
  }, [loginError]);

  const handleLogin = async () => {
    try {
      setError('');
      setLoading(true);
      await loginWithGoogle();
    } catch (err) {
      console.error(err);
      setError('Fallo al iniciar sesión. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--ink-800)',
      display: 'flex', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Cyan wash, top-right */}
      <div style={{
        position: 'absolute', top: -120, right: -100, width: 420, height: 420,
        borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(34,211,238,0.40) 0%, rgba(34,211,238,0) 65%)',
      }} />

      {/* Phone-width content column */}
      <div style={{
        width: '100%', maxWidth: 440,
        padding: '32px 24px calc(28px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column',
        position: 'relative', zIndex: 1,
        color: '#fff',
        animation: 'fadeUp var(--dur-slow) var(--ease-out)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/icons/icon-192.png"
            alt="Mis Finanzas"
            width={28}
            height={28}
            style={{ borderRadius: 8, display: 'block' }}
          />
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Mis Finanzas</div>
        </div>

        {/* Hero copy */}
        <div style={{ marginTop: 36 }}>
          <Editorial size={38} color="#fff" style={{ lineHeight: 1.0 }}>
            Hey, ¿necesitas<br />
            <span style={{ color: 'var(--clay-300)' }}>una radiografía?</span>
          </Editorial>
          <p style={{
            margin: '14px 0 0', fontSize: 14, lineHeight: 1.55,
            color: 'rgba(255,255,255,0.7)', maxWidth: 300,
          }}>
            Personal y negocio, lado a lado. Sin trucos motivacionales — solo los
            números que importan.
          </p>
        </div>

        {/* Floating product previews */}
        <div style={{ position: 'relative', height: 348, margin: '24px 0 4px' }}>
          {/* Balance */}
          <div style={{
            position: 'absolute', top: 4, left: 4, right: 52,
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, padding: '14px 16px',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
            }}>
              Balance total
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontSize: 22, fontWeight: 800, color: '#fff',
                letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
              }}>
                16.073.490
              </span>
              <span style={{ fontSize: 10, color: 'var(--clay-300)', fontWeight: 700 }}>
                +12% este mes
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <SparkLine
                points={[40, 52, 46, 58, 62, 55, 68, 72, 80, 76, 84, 90]}
                color="var(--clay-400)" height={30}
              />
            </div>
          </div>

          {/* Category */}
          <div style={{
            position: 'absolute', top: 132, left: 52, right: 0,
            background: 'rgba(27,32,43,0.92)', color: 'var(--fg-1)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 18, padding: '12px 14px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.34)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconTile icon="restaurant" hue="clay" size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Comida y salidas</div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>32% del mes · $ 1.8M</div>
              </div>
              <Pill variant="warning">86%</Pill>
            </div>
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={86} max={100} height={6} />
            </div>
          </div>

          {/* Streak */}
          <div style={{
            position: 'absolute', top: 252, left: 20, right: 64,
            background: 'var(--clay-500)', color: '#fff',
            borderRadius: 18, padding: '12px 14px',
            boxShadow: '0 20px 40px rgba(11,127,156,0.42)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="local_fire_department" size={22} fill />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>Racha</div>
                <div style={{
                  fontSize: 17, fontWeight: 700,
                  fontFamily: 'var(--font-display)', fontStyle: 'italic',
                }}>
                  14 días registrando
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.32)',
            color: '#FCA5A5', padding: '10px 14px', borderRadius: 12, marginBottom: 12,
            fontSize: 13, fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            height: 54, borderRadius: 14, border: 'none',
            background: loading ? 'var(--clay-800)' : 'var(--clay-500)',
            color: '#fff', cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15,
            boxShadow: 'var(--shadow-clay)',
            transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {loading ? (
            <Icon name="autorenew" size={20} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <span style={{
              width: 22, height: 22, borderRadius: '50%', background: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="" style={{ width: 14, height: 14 }}
              />
            </span>
          )}
          {loading ? 'Conectando...' : 'Ingresar con Google'}
        </button>

        <p style={{
          margin: '14px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.5)',
          textAlign: 'center', lineHeight: 1.5,
        }}>
          Acceso restringido. Solo cuentas autorizadas.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

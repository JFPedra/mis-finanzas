import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Shared infrastructure
import Header from './shared/components/Header';
import Sidebar from './shared/components/Sidebar';
import Login from './shared/components/Login';
import { usePushNotifications } from './shared/hooks/usePushNotifications';
import { Icon } from './shared/ds/Primitives';

// Auth (cross-cutting)
import { AuthProvider, useAuth } from './context/AuthContext';

// Domain provider
import { FinanceProvider, useFinance } from './domains/finance/context/FinanceContext';

// Insights es la vista inicial: import estático para no flashear un spinner
// en cada arranque. El resto se descarga al navegar (code-splitting),
// manteniendo pequeño el JS inicial.
import Insights from './domains/finance/components/Insights';

const Transactions       = lazy(() => import('./domains/finance/components/Transactions'));
const Presupuestos       = lazy(() => import('./domains/finance/components/Presupuestos'));
const Cuentas            = lazy(() => import('./domains/finance/components/Cuentas'));
const CategoriaDetalle   = lazy(() => import('./domains/finance/components/CategoriaDetalle'));
const TransaccionDetalle = lazy(() => import('./domains/finance/components/TransaccionDetalle'));
const TransactionModal   = lazy(() => import('./domains/finance/components/TransactionModal'));

// Settings stays in legacy location (evolves in place)
const Settings = lazy(() => import('./components/Settings'));

// Views that push from within a domain (not tab-bar destinations)
const DETAIL_VIEWS = ['categoria', 'transaccion'];

// Resolves a deep-link transaction ID using the in-memory cache first,
// avoiding a Firestore round-trip when the app is already open and subscribed.
function DeepLinkResolver({ currentUser, pendingEditId, setPendingEditId, openEditTransaction }) {
  const { transactions, loading } = useFinance();

  useEffect(() => {
    if (!currentUser || !pendingEditId) return;

    const cleanUrl = () => {
      if (typeof window === 'undefined') return;
      const u = new URL(window.location.href);
      u.searchParams.delete('editTx');
      window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    };

    const cached = transactions.find(t => t.id === pendingEditId);
    if (cached) {
      openEditTransaction(cached);
      setPendingEditId(null);
      cleanUrl();
      return;
    }

    if (loading) return;

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'finance_transactions', pendingEditId));
        if (!cancelled && snap.exists()) {
          openEditTransaction({ id: snap.id, ...snap.data() });
        }
      } catch (e) {
        console.error('No se pudo abrir la transacción del deep-link:', e);
      } finally {
        cleanUrl();
        if (!cancelled) setPendingEditId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, pendingEditId, transactions, loading, openEditTransaction, setPendingEditId]);

  return null;
}

// Mobile tab bar — 5 destinos; el FAB flota encima, a la derecha (con 5
// destinos no queda un hueco central para él)
const TabBar = React.memo(function TabBar({ activeView, onNavigate, onFab }) {
  const items = [
    { id: 'insights',     icon: 'insights',               label: 'Radiografía' },
    { id: 'transactions', icon: 'receipt_long',           label: 'Movimientos' },
    { id: 'cuentas',      icon: 'account_balance_wallet', label: 'Cuentas' },
    { id: 'presupuestos', icon: 'savings',                label: 'Presupuestos' },
    { id: 'settings',     icon: 'person',                 label: 'Yo' },
  ];

  return (
    <>
    <button
      type="button"
      onClick={onFab}
      aria-label="Agregar transacción"
      style={{
        position: 'fixed', right: 20, zIndex: 51,
        bottom: 'calc(12px + var(--tabbar-h) + 14px + env(safe-area-inset-bottom, 0px))',
        width: 54, height: 54, borderRadius: '50%', border: 'none',
        background: 'var(--clay-500)', color: '#fff', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--shadow-clay)',
        transition: 'transform var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.07)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <Icon name="add" size={26} />
    </button>
    <nav style={{
      position: 'fixed', left: 12, right: 12, bottom: 12,
      height: 'var(--tabbar-h)',
      background: 'rgba(20, 24, 32, 0.82)',
      backdropFilter: 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 22,
      display: 'flex', alignItems: 'center', padding: '0 6px',
      boxShadow: 'var(--shadow-lg)',
      zIndex: 50,
    }}>
      {items.map(item => {
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            style={{
              flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '8px 0',
              color: isActive ? 'var(--clay-400)' : 'var(--fg-3)',
              transition: 'color var(--dur-fast) var(--ease-out)',
            }}
          >
            <Icon name={item.icon} size={22} fill={isActive} />
            <span style={{ fontSize: 9, fontWeight: isActive ? 800 : 600, letterSpacing: '0.02em', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
    </>
  );
});

// Spinner mínimo mientras baja el chunk de una vista lazy.
function ViewLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid rgba(34, 211, 238, 0.2)',
        borderTopColor: '#0B7F9C',
        animation: 'splash-spin 0.8s linear infinite',
      }} />
    </div>
  );
}

// Mismo look del splash inline de index.html, para el lapso entre que React
// monta y Auth resuelve (evita flashear el Login a usuarios ya logueados).
function AuthSplash() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0E1116' }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 36, height: 36, margin: '-18px 0 0 -18px',
        borderRadius: '50%',
        border: '3px solid rgba(34, 211, 238, 0.2)',
        borderTopColor: '#0B7F9C',
        animation: 'splash-spin 0.8s linear infinite',
      }} />
    </div>
  );
}

function AppContent() {
  const { currentUser, authLoading } = useAuth();
  // Deep-link: ?view=cuentas&tab=gmf (alerta del 4x1000)
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window === 'undefined') return 'insights';
    return new URLSearchParams(window.location.search).get('view') === 'cuentas' ? 'cuentas' : 'insights';
  });
  const [viewParams, setViewParams] = useState(() => {
    if (typeof window === 'undefined') return null;
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab ? { tab } : null;
  });
  const [backView, setBackView] = useState('insights');
  const [isFABModalOpen, setIsFABModalOpen] = useState(false);
  const [fabModalMode, setFabModalMode] = useState('transaction');
  const [editingTx, setEditingTx] = useState(null);

  // Deep-link: ?editTx=<id> from push notification
  const [pendingEditId, setPendingEditId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('editTx');
  });

  useEffect(() => {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('view') && !u.searchParams.has('tab')) return;
    u.searchParams.delete('view');
    u.searchParams.delete('tab');
    window.history.replaceState({}, '', u.pathname + u.search + u.hash);
  }, []);

  // In-app foreground notice stack
  const [foregroundNotices, setForegroundNotices] = useState([]);
  const noticeIdRef = useRef(0);
  const dismissNotice = useCallback((id) => {
    setForegroundNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const openEditTransaction = useCallback((tx) => {
    setEditingTx(tx);
    setFabModalMode('transaction');
    setIsFABModalOpen(true);
  }, []);

  const openAddTransaction = useCallback(() => {
    setEditingTx(null);
    setFabModalMode('transaction');
    setIsFABModalOpen(true);
  }, []);

  const push = usePushNotifications(useCallback((payload) => {
    const d = payload?.data || {};
    setForegroundNotices((prev) => {
      const filtered = d.txId ? prev.filter((n) => n.txId !== d.txId) : prev;
      const next = [...filtered, { id: ++noticeIdRef.current, txId: d.txId, kind: d.kind, title: d.title, body: d.body }];
      return next.slice(-4);
    });
  }, []));

  // PWA postMessage from service worker (notification tap, app already open)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (e) => {
      if (e.data?.type === 'OPEN_EDIT_TX' && e.data.url) {
        const params = new URL(e.data.url, window.location.origin).searchParams;
        const id = params.get('editTx');
        if (id) setPendingEditId(id);
        if (params.get('view') === 'cuentas') {
          setCurrentView('cuentas');
          setViewParams({ tab: params.get('tab') || 'gmf' });
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  if (authLoading) {
    return <AuthSplash />;
  }

  if (!currentUser) {
    return <Login />;
  }

  const navigate = (view, params = null) => {
    if (DETAIL_VIEWS.includes(view) && !DETAIL_VIEWS.includes(currentView)) {
      setBackView(currentView);
    }
    setCurrentView(view);
    setViewParams(params);
  };

  const goBack = () => navigate(backView);

  const isDetailView = DETAIL_VIEWS.includes(currentView);
  const isSettingsView = currentView === 'settings';

  return (
    <FinanceProvider>
      <DeepLinkResolver
        currentUser={currentUser}
        pendingEditId={pendingEditId}
        setPendingEditId={setPendingEditId}
        openEditTransaction={openEditTransaction}
      />
      <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>

        {/* Desktop sidebar rail */}
        <div className="hidden md:block">
          <Sidebar activeView={currentView} onNavigate={navigate} />
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Sticky header — hidden on detail views */}
          {!isDetailView && <Header />}

          {/* Scrollable content */}
          <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }} className="pb-28 md:pb-8">
            <Suspense fallback={<ViewLoader />}>
            {currentView === 'insights'      && <Insights onNavigate={navigate} onAddTransaction={openAddTransaction} onEditTransaction={openEditTransaction} />}
            {currentView === 'transactions'  && <Transactions onNavigate={navigate} onEditTransaction={openEditTransaction} />}
            {currentView === 'presupuestos'  && <Presupuestos onNavigate={navigate} />}
            {currentView === 'cuentas'       && <Cuentas initialTab={viewParams?.tab} onNavigate={navigate} />}
            {currentView === 'categoria'     && <CategoriaDetalle categoryName={viewParams?.category} onBack={goBack} onNavigate={navigate} />}
            {currentView === 'transaccion'   && <TransaccionDetalle txId={viewParams?.txId} onBack={goBack} onEdit={openEditTransaction} />}
            {isSettingsView && <Settings key={viewParams?.tab || 'default'} onNavigate={navigate} push={push} initialTab={viewParams?.tab} />}
            </Suspense>
          </main>
        </div>

        {/* Desktop FABs */}
        {!isSettingsView && (
          <div className="hidden md:flex" style={{
            position: 'fixed', right: 28, bottom: 28,
            flexDirection: 'column', gap: 10, zIndex: 50,
          }}>
            <button
              type="button"
              onClick={() => { setFabModalMode('transfer'); setIsFABModalOpen(true); }}
              style={{
                height: 44, padding: '0 16px 0 12px', gap: 7, borderRadius: 9999,
                border: 'none', cursor: 'pointer',
                background: 'var(--ink-800)', color: '#fff',
                boxShadow: '0 8px 24px -6px rgba(0,0,0,0.40)',
                display: 'inline-flex', alignItems: 'center',
                fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12,
                transition: 'transform var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Icon name="swap_horiz" size={18} />
              Transferir
            </button>
            <button
              type="button"
              onClick={openAddTransaction}
              style={{
                height: 52, padding: '0 20px 0 16px', gap: 8, borderRadius: 9999,
                border: 'none', cursor: 'pointer',
                background: 'var(--clay-500)', color: '#fff',
                boxShadow: 'var(--shadow-clay)',
                display: 'inline-flex', alignItems: 'center',
                fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 13,
                transition: 'transform var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Icon name="add" size={22} />
              Agregar transacción
            </button>
          </div>
        )}

        {/* Mobile tab bar */}
        <div className="md:hidden">
          <TabBar
            activeView={isDetailView ? backView : currentView}
            onNavigate={navigate}
            onFab={openAddTransaction}
          />
        </div>

        {/* Foreground push notices */}
        {foregroundNotices.length > 0 && (
          <div style={{
            position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            margin: '0 auto', maxWidth: 460, zIndex: 60,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {foregroundNotices.map((notice) => (
              <div key={notice.id} style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: 16, boxShadow: 'var(--shadow-lg)',
                padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'var(--clay-500)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={notice.kind === 'gmf' ? 'receipt_long' : 'rate_review'} size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--fg-1)' }}>
                    {notice.title || 'Pendiente de revisión'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {notice.body || 'Nuevo movimiento por revisar'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (notice.txId) setPendingEditId(notice.txId);
                    if (notice.kind === 'gmf') navigate('cuentas', { tab: 'gmf' });
                    dismissNotice(notice.id);
                  }}
                  style={{
                    flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 9999,
                    border: 'none', cursor: 'pointer', background: 'var(--ink-800)', color: '#fff',
                    fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12,
                  }}
                >
                  Revisar
                </button>
                <button
                  type="button"
                  onClick={() => dismissNotice(notice.id)}
                  aria-label="Cerrar"
                  style={{
                    flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                    border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--fg-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Montado solo al abrir: el modal retorna null cerrado, así que
            esto es equivalente y evita descargar su chunk al inicio. */}
        {isFABModalOpen && (
          <Suspense fallback={null}>
            <TransactionModal
              isOpen={isFABModalOpen}
              onClose={() => { setIsFABModalOpen(false); setEditingTx(null); }}
              editingTransaction={editingTx}
              initialMode={fabModalMode}
            />
          </Suspense>
        )}
      </div>
    </FinanceProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

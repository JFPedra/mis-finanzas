import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../../firebase';
import { collection, onSnapshot, addDoc, doc, setDoc, getDoc, Timestamp, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { normalizeCategory, parseTransactionDate, calculateBalances } from '../utils/financeHelpers';
import { getProducts } from '../utils/accountHelpers';
import { FEATURES } from '../../../config/features';

const FinanceContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useFinance = () => useContext(FinanceContext);

const DEFAULT_CONFIG = {
    currencies: ['COP', 'USD', 'EUR'],
    accounts: ['Efectivo', 'Tarjeta de Crédito Principal', 'Cuenta Bancaria'],
    // Config de instancia (editable en Settings → Finanzas)
    gmailLabel: 'Bancos/PendingBot',
    exchangeRate: 4100,
    categories: [
        { name: 'Hogar', subcategories: ['Arriendo', 'Servicios Públicos', 'Internet', 'Plan Celular', 'Mercado', 'Aseo', 'Mantenimiento', 'Muebles', 'Utensilios y accesorios'], icon: 'home', type: 'debit', context: 'personal' },
        { name: 'Comida', subcategories: ['Domicilios / Rappi', 'Restaurantes / Cafés'], icon: 'restaurant', type: 'debit', context: 'personal' },
        { name: 'Transporte', subcategories: ['Uber / Taxi', 'Metro / Bus', 'Gasolina / Peajes', 'Mantenimiento Vehículo', 'Vuelos', 'Alquiler Vehiculo', 'Parqueadero'], icon: 'directions_car', type: 'debit', context: 'personal' },
        { name: 'Salud y Bienestar', subcategories: ['Citas Médicas / Copagos', 'Medicamentos / Farmacia', 'Cuidado Personal (Barbería, peluquería, masajes)', 'Gym'], icon: 'fitness_center', type: 'debit', context: 'personal' },
        { name: 'Estilo de Vida y Ocio', subcategories: ['Citas / Pareja', 'Suscripciones', 'Compras / Ropa / Gadgets', 'Entretenimiento (Cine, conciertos, rumba)', 'Regalos'], icon: 'shopping_bag', type: 'debit', context: 'personal' },
        { name: 'Financiero y Deudas', subcategories: ['Intereses / Comisiones', 'Seguros', 'Impuestos Personales', 'Prestamo', 'Pago a Créditos', 'Pago a Tarjetas'], icon: 'account_balance', type: 'debit', context: 'personal' },
        { name: 'Ingresos', subcategories: ['Salario', 'Ventas', 'Rendimientos / Intereses', 'Cashbacks / Devoluciones'], icon: 'payments', type: 'credit', context: 'both' },
        { name: 'Operación', subcategories: ['SaaS / Software', 'Equipos / Máquinas', 'Materiales / Insumos', 'Nómina', 'Impuestos (IVA, Renta)', 'Comisiones Bancarias / Pasarelas de Pago', 'Procesamiento'], icon: 'storefront', type: 'debit', context: 'business' }
    ]
};

export const FinanceProvider = ({ children }) => {
    const [transactions, setTransactions] = useState([]);
    const [budgets, setBudgets] = useState({});
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    // Con Negocio oculto la app opera fija en 'personal' (el contexto
    // 'unified' no permite gestionar presupuestos)
    const [currentContext, setCurrentContext] = useState(FEATURES.business ? 'unified' : 'personal');

    // Global Config State
    const [appConfig, setAppConfig] = useState(DEFAULT_CONFIG);

    useEffect(() => {
        // Fetch Settings Configuration
        const fetchConfig = async () => {
            try {
                const configRef = doc(db, 'finance_settings', 'default');
                const configSnap = await getDoc(configRef);

                if (configSnap.exists()) {
                    const data = configSnap.data();
                    let needsMigration = false;
                    let migratedCategories = data.categories || [];

                    // Migration: Check if categories need migration
                    if (migratedCategories.length > 0) {
                        migratedCategories = migratedCategories.map(cat => {
                            if (typeof cat === 'string') {
                                needsMigration = true;
                                const isIncome = cat.toLowerCase().includes('ingreso');
                                return {
                                    name: cat,
                                    subcategories: [],
                                    icon: 'category',
                                    type: isIncome ? 'credit' : 'debit',
                                    context: 'personal'
                                };
                            } else if (typeof cat === 'object') {
                                // Check if any fields are missing
                                let updatedCat = { ...cat };
                                if (!updatedCat.icon || !updatedCat.type || !updatedCat.context) {
                                    needsMigration = true;
                                    const isIncome = (updatedCat.name || '').toLowerCase().includes('ingreso');
                                    updatedCat.icon = updatedCat.icon || 'category';
                                    updatedCat.type = updatedCat.type || (isIncome ? 'credit' : 'debit');
                                    updatedCat.context = updatedCat.context || 'personal';
                                }
                                return updatedCat;
                            }
                            return cat;
                        });
                    }

                    if (needsMigration) {
                        const migratedConfig = { ...data, categories: migratedCategories };
                        setAppConfig(migratedConfig);
                        // Update Firestore immediately to migrate persistence
                        await updateDoc(configRef, { categories: migratedCategories });
                    } else {
                        setAppConfig(data);
                    }
                } else {
                    // Initialize default if it doesn't exist
                    await setDoc(configRef, DEFAULT_CONFIG);
                }
            } catch (error) {
                console.error("Error fetching config: ", error);
                // Do not set loading false here, wait for transactions
            }
        };

        fetchConfig();

        // Subscribe to transactions collection
        const unsubscribeTransactions = onSnapshot(collection(db, 'finance_transactions'), (snapshot) => {
            const txs = snapshot.docs.map(doc => {
                const data = doc.data();
                const date = parseTransactionDate(data.date);
                const category = normalizeCategory(data.category);

                // sortAt = día del campo `date` (lo que se muestra) + hora real del
                // `timestamp` (si existe). Así ordenamos por fecha Y hora sin afectar
                // el día mostrado (incluye registros con fecha retroactiva).
                let sortAt = date;
                if (data.timestamp && typeof data.timestamp.toDate === 'function') {
                    const ts = data.timestamp.toDate();
                    sortAt = new Date(
                        date.getFullYear(), date.getMonth(), date.getDate(),
                        ts.getHours(), ts.getMinutes(), ts.getSeconds(), ts.getMilliseconds()
                    );
                }

                return {
                    id: doc.id,
                    ...data,
                    category,
                    date,
                    sortAt,
                };
            });

            // Ordenar por fecha+hora descendente (más reciente primero)
            txs.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
            setTransactions(txs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching transactions:", error);
            setLoading(false); // Make sure it stops loading even on error
        });

        // Subscribe to goals collection
        const unsubscribeGoals = onSnapshot(collection(db, 'finance_goals'), (snapshot) => {
            const goalsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));
            setGoals(goalsData);
        }, (error) => {
            console.error("Error fetching goals:", error);
        });

        // Cleanup subscriptions on unmount
        return () => {
            unsubscribeTransactions();
            unsubscribeGoals();
        }
    }, []);

    const updateAppConfig = useCallback(async (newConfig) => {
        try {
            const configRef = doc(db, 'finance_settings', 'default');
            await setDoc(configRef, newConfig);
            setAppConfig(newConfig);
        } catch (error) {
            console.error("Error updating config: ", error);
            throw error;
        }
    }, []);

    // Escribe solo los campos indicados (merge) — para preferencias puntuales de UI
    // sin riesgo de pisar el resto de la config con un estado en memoria desactualizado.
    const patchAppConfig = useCallback(async (patch) => {
        try {
            const configRef = doc(db, 'finance_settings', 'default');
            await setDoc(configRef, patch, { merge: true });
            setAppConfig(prev => ({ ...prev, ...patch }));
        } catch (error) {
            console.error("Error patching config: ", error);
            throw error;
        }
    }, []);

    const products = useMemo(() => getProducts(appConfig), [appConfig]);

    // Guarda el catálogo de productos. `accounts` (solo nombres) se reescribe a
    // la par porque el resto de la app y el sync de Python lo leen. Un rename
    // re-apunta los movimientos y metas al nombre nuevo para no partir el
    // historial del producto.
    const saveProducts = useCallback(async (nextProducts, renames = []) => {
        const effective = renames.filter(r => r.from && r.to && r.from !== r.to);
        if (effective.length) {
            const map = new Map(effective.map(r => [r.from, r.to]));
            const writes = [];
            transactions.forEach(t => {
                const patch = {};
                if (map.has(t.card)) patch.card = map.get(t.card);
                if (map.has(t.destinationCard)) patch.destinationCard = map.get(t.destinationCard);
                if (Object.keys(patch).length) writes.push([doc(db, 'finance_transactions', t.id), patch]);
            });
            goals.forEach(g => {
                if (map.has(g.cuenta)) writes.push([doc(db, 'finance_goals', g.id), { cuenta: map.get(g.cuenta) }]);
            });
            for (let i = 0; i < writes.length; i += 450) {
                const batch = writeBatch(db);
                writes.slice(i, i + 450).forEach(([ref, patch]) => batch.update(ref, patch));
                await batch.commit();
            }
        }
        await patchAppConfig({
            accounts: nextProducts.map(p => p.name),
            products: nextProducts,
        });
    }, [transactions, goals, patchAppConfig]);

    const addTransaction = useCallback(async (data) => {
        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const defaultDateStr = `${year}-${month}-${day}`;

            await addDoc(collection(db, 'finance_transactions'), {
                date: defaultDateStr,
                timestamp: Timestamp.now(),
                status: 'reviewed',
                ...data,
            });
        } catch (error) {
            console.error("Error adding document: ", error);
            throw error;
        }
    }, []);

    const addTransfer = useCallback(async (transferData) => {
        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const defaultDateStr = `${year}-${month}-${day}`;

            await addDoc(collection(db, 'finance_transactions'), {
                title: transferData.title || 'Transferencia',
                amount: Number(transferData.amount),
                type: 'transfer',
                context: transferData.sourceContext,
                destinationContext: transferData.destinationContext,
                category: transferData.category || 'Financiero y Deudas',
                subcategory: transferData.subcategory || '',
                currency: transferData.currency,
                card: transferData.sourceAccount,
                destinationCard: transferData.destinationAccount,
                comments: transferData.comments || '',
                date: transferData.date || defaultDateStr,
                timestamp: Timestamp.now(),
                status: 'reviewed',
            });
        } catch (error) {
            console.error("Error adding transfer: ", error);
            throw error;
        }
    }, []);

    const deleteTransaction = useCallback(async (id) => {
        try {
            await deleteDoc(doc(db, 'finance_transactions', id));
        } catch (error) {
            console.error("Error deleting document: ", error);
            throw error;
        }
    }, []);

    const updateTransaction = useCallback(async (id, data) => {
        try {
            await updateDoc(doc(db, 'finance_transactions', id), { ...data });
        } catch (error) {
            console.error("Error updating document: ", error);
            throw error;
        }
    }, []);

    // Memoize global balance calculations to avoid re-computing on every render/call
    const balances = useMemo(() => calculateBalances(transactions), [transactions]);

    // Calculate balances based on context and transaction type
    const getTotals = useCallback((contextFilter) => {
        // filter transactions based on context ('personal', 'business' or 'unified')
        const filtered = transactions.filter(t =>
            contextFilter === 'unified' ? true : t.context === contextFilter
        );

        return {
            ...balances,
            filteredTransactions: filtered
        };
    }, [transactions, balances]);

    // --- Metas / Goals Methods ---
    const addGoal = useCallback(async (data) => {
        try {
            await addDoc(collection(db, 'finance_goals'), data);
        } catch (error) {
            console.error("Error adding goal: ", error);
            throw error;
        }
    }, []);

    const updateGoal = useCallback(async (id, data) => {
        try {
            await updateDoc(doc(db, 'finance_goals', id), data);
        } catch (error) {
            console.error("Error updating goal: ", error);
            throw error;
        }
    }, []);

    const deleteGoal = useCallback(async (id) => {
        try {
            await deleteDoc(doc(db, 'finance_goals', id));
        } catch (error) {
            console.error("Error deleting goal: ", error);
            throw error;
        }
    }, []);

    // --- Presupuestos / Budgets Methods (Automatic Cloning) ---
    // Fetch budget for a specific month and context. If not found, attempts to clone the previous month.
    const fetchBudgetConfig = useCallback(async (monthStr, context) => {
        try {
            const budgetId = `${monthStr}_${context}`;
            const budgetRef = doc(db, 'finance_budgets', budgetId);
            const budgetSnap = await getDoc(budgetRef);

            if (budgetSnap.exists()) {
                const data = budgetSnap.data();
                setBudgets(prev => ({ ...prev, [budgetId]: data }));
                return data;
            } else {
                // Not found. Attempt cloning.
                // Expected monthStr format: YYYY-MM
                const [year, month] = monthStr.split('-');
                let prevDate = new Date(year, parseInt(month) - 1 - 1, 1); // -1 for 0 index, -1 for previous month
                if (isNaN(prevDate)) return null;

                const prevYYYY = prevDate.getFullYear();
                const prevMM = String(prevDate.getMonth() + 1).padStart(2, '0');
                const prevMonthStr = `${prevYYYY}-${prevMM}`;
                const prevBudgetId = `${prevMonthStr}_${context}`;

                const prevBudgetRef = doc(db, 'finance_budgets', prevBudgetId);
                const prevBudgetSnap = await getDoc(prevBudgetRef);

                if (prevBudgetSnap.exists()) {
                    const clonedData = prevBudgetSnap.data();

                    // Save the cloned data directly as the new month's config
                    await setDoc(budgetRef, clonedData);
                    setBudgets(prev => ({ ...prev, [budgetId]: clonedData }));
                    return clonedData;
                }

                // If previous doesn't exist either, return empty setup
                return null;
            }
        } catch (error) {
            console.error("Error in fetchBudgetConfig: ", error);
            return null;
        }
    }, []);

    const saveBudgetConfig = useCallback(async (monthStr, context, newCategories) => {
        try {
            const budgetId = `${monthStr}_${context}`;
            const budgetRef = doc(db, 'finance_budgets', budgetId);
            const dataToSave = {
                month: monthStr,
                context: context,
                categories: newCategories,
                updatedAt: Timestamp.now()
            };

            await setDoc(budgetRef, dataToSave);
            setBudgets(prev => ({ ...prev, [budgetId]: dataToSave }));
        } catch (error) {
            console.error("Error saving budget config: ", error);
            throw error;
        }
    }, []);


    const value = useMemo(() => ({
        transactions,
        budgets,
        goals,
        loading,
        currentContext,
        setCurrentContext,
        addTransaction,
        addTransfer,
        deleteTransaction,
        updateTransaction,
        getTotals,
        appConfig,
        updateAppConfig,
        patchAppConfig,
        products,
        saveProducts,
        addGoal,
        updateGoal,
        deleteGoal,
        fetchBudgetConfig,
        saveBudgetConfig,
    }), [
        transactions, budgets, goals, loading, currentContext, getTotals, appConfig,
        addTransaction, addTransfer, deleteTransaction, updateTransaction,
        updateAppConfig, patchAppConfig, products, saveProducts,
        addGoal, updateGoal, deleteGoal, fetchBudgetConfig, saveBudgetConfig,
    ]);

    return (
        <FinanceContext.Provider value={value}>
            {children}
        </FinanceContext.Provider>
    );
};

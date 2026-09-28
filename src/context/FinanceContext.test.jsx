import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { FinanceProvider, useFinance } from './FinanceContext';

// ─────────────────────────────────────────────────
// Mock Firebase
// ─────────────────────────────────────────────────
const mockOnSnapshot = vi.fn();
const mockAddDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockGetDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    onSnapshot: (...args) => mockOnSnapshot(...args),
    addDoc: (...args) => mockAddDoc(...args),
    doc: vi.fn(() => 'mock-doc-ref'),
    setDoc: (...args) => mockSetDoc(...args),
    getDoc: (...args) => mockGetDoc(...args),
    Timestamp: { now: vi.fn(() => ({ seconds: 1234567890 })) },
    deleteDoc: (...args) => mockDeleteDoc(...args),
    updateDoc: (...args) => mockUpdateDoc(...args),
    writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
}));

vi.mock('../firebase', () => ({
    db: {},
}));

// ─────────────────────────────────────────────────
// Helper: renders a consumer component that exposes context values
// ─────────────────────────────────────────────────
function TestConsumer({ onRender }) {
    const ctx = useFinance();
    onRender(ctx);
    return <div data-testid="consumer">loaded</div>;
}

describe('FinanceProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default: getDoc returns no config (triggers default initialization)
        mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null });

        // Default: onSnapshot immediately fires with empty docs
        mockOnSnapshot.mockImplementation((collectionRef, successCb) => {
            successCb({ docs: [] });
            return vi.fn(); // unsubscribe
        });
    });

    it('renders children without crashing', () => {
        render(
            <FinanceProvider>
                <div data-testid="child">Hello</div>
            </FinanceProvider>
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('provides default empty state', async () => {
        let contextValue;

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        expect(contextValue.transactions).toEqual([]);
        expect(contextValue.goals).toEqual([]);
        expect(contextValue.loading).toBe(false);
    });

    it('provides appConfig with default values when Firestore has no config', async () => {
        let contextValue;

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        expect(contextValue.appConfig).toBeDefined();
        expect(contextValue.appConfig.currencies).toContain('COP');
        expect(contextValue.appConfig.accounts.length).toBeGreaterThan(0);
    });

    it('exposes addTransaction that calls addDoc', async () => {
        let contextValue;
        mockAddDoc.mockResolvedValue({ id: 'new-tx-id' });

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        await act(async () => {
            await contextValue.addTransaction({
                title: 'Test',
                amount: 5000,
                type: 'debit',
                currency: 'COP',
            });
        });

        expect(mockAddDoc).toHaveBeenCalledTimes(1);
        const callArgs = mockAddDoc.mock.calls[0][1];
        expect(callArgs.title).toBe('Test');
        expect(callArgs.amount).toBe(5000);
        expect(callArgs.date).toBeDefined(); // Now a YYYY-MM-DD string
    });

    it('exposes deleteTransaction that calls deleteDoc', async () => {
        let contextValue;
        mockDeleteDoc.mockResolvedValue(undefined);

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        await act(async () => {
            await contextValue.deleteTransaction('test-id-123');
        });

        expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });

    it('exposes updateTransaction that calls updateDoc', async () => {
        let contextValue;
        mockUpdateDoc.mockResolvedValue(undefined);

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        await act(async () => {
            await contextValue.updateTransaction('tx-id', { amount: 9999 });
        });

        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    it('addTransaction throws and propagates errors', async () => {
        let contextValue;
        mockAddDoc.mockRejectedValue(new Error('Firestore error'));

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        await expect(
            contextValue.addTransaction({ title: 'Fail', amount: 100 })
        ).rejects.toThrow('Firestore error');
    });

    it('processes transactions from snapshot with normalized data', async () => {
        let contextValue;

        mockOnSnapshot.mockImplementation((collectionRef, successCb) => {
            // First call = transactions, second call = goals
            if (mockOnSnapshot.mock.calls.length <= 1) {
                successCb({
                    docs: [
                        {
                            id: 'tx1',
                            data: () => ({
                                title: 'Almuerzo',
                                amount: 15000,
                                type: 'debit',
                                currency: 'COP',
                                context: 'personal',
                                category: { name: 'Comida', subcategories: [] }, // Object category
                                date: { toDate: () => new Date('2026-01-10T12:00:00Z') },
                            }),
                        },
                        {
                            id: 'tx2',
                            data: () => ({
                                title: 'Salario',
                                amount: 3000000,
                                type: 'credit',
                                currency: 'COP',
                                context: 'personal',
                                category: 'Ingresos', // String category
                                date: '2026-01-15',
                            }),
                        },
                    ],
                });
            } else {
                successCb({ docs: [] });
            }
            return vi.fn();
        });

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        expect(contextValue.transactions).toHaveLength(2);
        // Category should be normalized to strings
        expect(contextValue.transactions[0].category).toBe('Ingresos');
        expect(contextValue.transactions[1].category).toBe('Comida');
        // Dates should be Date objects
        expect(contextValue.transactions[0].date).toBeInstanceOf(Date);
        expect(contextValue.transactions[1].date).toBeInstanceOf(Date);
    });

    it('exposes goal CRUD methods', async () => {
        let contextValue;
        mockAddDoc.mockResolvedValue({ id: 'goal-1' });
        mockUpdateDoc.mockResolvedValue(undefined);
        mockDeleteDoc.mockResolvedValue(undefined);

        await act(async () => {
            render(
                <FinanceProvider>
                    <TestConsumer onRender={(ctx) => { contextValue = ctx; }} />
                </FinanceProvider>
            );
        });

        // addGoal
        await act(async () => {
            await contextValue.addGoal({ name: 'Vacaciones', target: 5000000 });
        });
        expect(mockAddDoc).toHaveBeenCalled();

        // updateGoal
        await act(async () => {
            await contextValue.updateGoal('goal-1', { name: 'Vacaciones Updated' });
        });
        expect(mockUpdateDoc).toHaveBeenCalled();

        // deleteGoal
        await act(async () => {
            await contextValue.deleteGoal('goal-1');
        });
        expect(mockDeleteDoc).toHaveBeenCalled();
    });
});

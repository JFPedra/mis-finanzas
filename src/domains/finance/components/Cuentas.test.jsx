import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getProducts } from '../utils/accountHelpers';

const appConfig = {
  accounts: ['Bancolombia Ahorros', 'Visa Oro', 'Efectivo'],
  products: [
    { name: 'Bancolombia Ahorros', type: 'savings', bank: 'Bancolombia', last4: '1234', gmf: { exempt: true, alertsEnabled: true, thresholds: [80, 95] } },
    { name: 'Visa Oro', type: 'credit', bank: 'Davivienda', last4: '9876' },
  ],
};

const transactions = [
  { id: '1', type: 'credit', amount: 5000000, currency: 'COP', card: 'Bancolombia Ahorros', date: '2026-09-01', context: 'personal' },
  { id: '2', type: 'debit', amount: 15500000, currency: 'COP', card: 'Bancolombia Ahorros', date: '2026-09-03', context: 'personal' },
  { id: '3', type: 'debit', amount: 300000, currency: 'COP', card: 'Visa Oro', date: '2026-09-05', context: 'personal' },
  { id: '4', type: 'transfer', amount: 300000, currency: 'COP', card: 'Bancolombia Ahorros', destinationCard: 'Visa Oro', date: '2026-09-20', context: 'personal' },
];

vi.mock('../context/FinanceContext', () => ({
  useFinance: () => ({
    transactions,
    products: getProducts(appConfig),
    appConfig,
    currentContext: 'personal',
    loading: false,
    setCurrentContext: vi.fn(),
    saveProducts: vi.fn(),
    patchAppConfig: vi.fn(),
  }),
}));

vi.mock('../../../context/FinanceContext', () => ({
  useFinance: () => ({
    transactions,
    products: getProducts(appConfig),
    appConfig,
    saveProducts: vi.fn(),
    patchAppConfig: vi.fn(),
  }),
}));

import Cuentas from './Cuentas';
import { ProductsSection, GmfConfigSection } from '../../../components/ProductsSection';

describe('Cuentas view', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 12));
  });
  afterEach(() => vi.useRealTimers());

  it('renders the total history by month', () => {
    render(<Cuentas />);
    expect(screen.getAllByText('sep 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ingresos').length).toBeGreaterThan(0);
  });

  it('switches to quarterly and to a credit card product', () => {
    render(<Cuentas initialTab="productos" />);
    fireEvent.click(screen.getByText('Trimestral'));
    expect(screen.getAllByText('T3 2026').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Visa Oro'));
    expect(screen.getAllByText('Pagos a la tarjeta').length).toBeGreaterThan(0);
  });

  it('shows the 4x1000 dashboard with the warning level', () => {
    render(<Cuentas initialTab="gmf" />);
    expect(screen.getAllByText('$ 18.330.900').length).toBeGreaterThan(0);
    expect(screen.getByText('Cerca del tope')).toBeInTheDocument();
  });
});

describe('ProductsSection', () => {
  it('lists products and opens the form with GMF options', () => {
    render(<ProductsSection />);
    expect(screen.getByText('Exenta 4x1000')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Agregar'));
    expect(screen.getByText('Nuevo producto')).toBeInTheDocument();
    expect(screen.getByText('Marcada como exenta del 4x1000')).toBeInTheDocument();
  });

  it('renders the UVT config', () => {
    render(<GmfConfigSection />);
    expect(screen.getByText('4x1000 · UVT')).toBeInTheDocument();
  });
});

import type { Metadata } from 'next';
import BudgetClient from './BudgetClient';

export const metadata: Metadata = { title: { absolute: 'Budget Management — IT' } };

export default function Page() {
  return <BudgetClient />;
}

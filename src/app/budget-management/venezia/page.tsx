import type { Metadata } from 'next';
import BudgetClient from '../BudgetClient';
import { schoolByCode } from '@/lib/budgets';

export const metadata: Metadata = { title: { absolute: 'Budget Venezia — IT' } };

export default function Page() {
  return <BudgetClient school={schoolByCode('venezia')!} />;
}

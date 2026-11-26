import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BudgetClient from '../BudgetClient';
import { schoolByCode } from '@/lib/budgets';
import { BUDGET_ENABLED } from '@/lib/features';

export const metadata: Metadata = { title: { absolute: 'Budget Venezia — IT' } };

export default function Page() {
  if (!BUDGET_ENABLED) notFound();
  return <BudgetClient school={schoolByCode('venezia')!} />;
}

import type { Metadata } from 'next';
import BudgetClient from '../BudgetClient';
import { schoolByCode } from '@/lib/budgets';

export const metadata: Metadata = { title: { absolute: 'Budget — H-IS Vicenza' } };

export default function Page() {
  return <BudgetClient school={schoolByCode('vicenza')!} />;
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SchoolPickerClient from './SchoolPickerClient';
import { BUDGET_ENABLED } from '@/lib/features';

export const metadata: Metadata = { title: { absolute: 'Budget Management — IT' } };

export default function Page() {
  if (!BUDGET_ENABLED) notFound();
  return <SchoolPickerClient />;
}

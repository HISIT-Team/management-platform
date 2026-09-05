import type { Metadata } from 'next';
import SchoolPickerClient from './SchoolPickerClient';

export const metadata: Metadata = { title: { absolute: 'Budget Management — IT' } };

export default function Page() {
  return <SchoolPickerClient />;
}

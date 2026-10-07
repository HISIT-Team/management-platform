import type { Metadata } from 'next';
import PurchasesClient from './PurchasesClient';

export const metadata: Metadata = { title: { absolute: 'Purchases — H-IS Vicenza' } };

export default function Page() {
  return <PurchasesClient />;
}

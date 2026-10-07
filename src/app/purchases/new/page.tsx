import type { Metadata } from 'next';
import PurchaseFormClient from './PurchaseFormClient';

export const metadata: Metadata = { title: { absolute: 'New purchase request — H-IS Vicenza' } };

export default function Page() {
  return <PurchaseFormClient />;
}

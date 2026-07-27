import type { Metadata } from 'next';
import MedicineConsentClient from './MedicineConsentClient';

export const metadata: Metadata = { title: { absolute: 'Medicine Consent Form — H-FARM International School' } };

export default function Page() {
  return <MedicineConsentClient />;
}

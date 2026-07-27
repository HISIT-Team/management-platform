import type { Metadata } from 'next';
import SpecialDietClient from './SpecialDietClient';

export const metadata: Metadata = { title: { absolute: 'Special Diet Request — H-FARM International School' } };

export default function Page() {
  return <SpecialDietClient />;
}

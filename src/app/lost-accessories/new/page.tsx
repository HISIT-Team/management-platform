import type { Metadata } from 'next';
import LostAccessoryFormClient from './LostAccessoryFormClient';

export const metadata: Metadata = { title: { absolute: 'Segnala accessori smarriti — IT' } };

export default function Page() {
  return <LostAccessoryFormClient />;
}

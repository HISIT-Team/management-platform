import type { Metadata } from 'next';
import DeviceHistoryClient from './DeviceHistoryClient';

export const metadata: Metadata = { title: { absolute: 'Storico assegnazioni — IT' } };

export default function Page() {
  return <DeviceHistoryClient />;
}

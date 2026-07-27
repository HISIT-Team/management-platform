import type { Metadata } from 'next';
import HubPage from '@/components/HubPage';
import { HUBS } from '@/lib/hubs';

export const metadata: Metadata = { title: { absolute: 'HIS Device Platform — IT' } };

export default function Page() {
  return <HubPage config={HUBS['it']} />;
}

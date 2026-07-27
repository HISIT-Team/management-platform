import type { Metadata } from 'next';
import HubPage from '@/components/HubPage';
import { HUBS } from '@/lib/hubs';

export const metadata: Metadata = { title: { absolute: 'Request for Medicines — HIS Management Platform' } };

export default function Page() {
  return <HubPage config={HUBS['request-medicines-hub']} />;
}

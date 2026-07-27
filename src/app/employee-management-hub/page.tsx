import type { Metadata } from 'next';
import HubPage from '@/components/HubPage';
import { HUBS } from '@/lib/hubs';

export const metadata: Metadata = { title: { absolute: 'HIS HR — Employee Management' } };

export default function Page() {
  return <HubPage config={HUBS['employee-management-hub']} />;
}

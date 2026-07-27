import type { Metadata } from 'next';
import OffboardingClient from './OffboardingClient';

export const metadata: Metadata = { title: { absolute: 'Employee Management' } };

export default function Page() {
  return <OffboardingClient />;
}

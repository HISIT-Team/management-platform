import type { Metadata } from 'next';
import SecuritySettingsClient from './SecuritySettingsClient';

export const metadata: Metadata = { title: { absolute: 'Sicurezza — Backend' } };

export default function Page() {
  return <SecuritySettingsClient />;
}

import type { Metadata } from 'next';
import MfaClient from './MfaClient';

export const metadata: Metadata = { title: 'Two-factor authentication' };

export default function Page() {
  return <MfaClient />;
}

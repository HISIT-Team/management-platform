import type { Metadata } from 'next';
import StudentQrClient from './StudentQrClient';

export const metadata: Metadata = { title: { absolute: 'Student QR — Device Management' } };

export default function Page() {
  return <StudentQrClient />;
}

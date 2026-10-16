import type { Metadata } from 'next';
import StudentQrClient from './StudentQrClient';

export const metadata: Metadata = { title: { absolute: 'Student QR — HIS IT' } };

export default function Page() {
  return <StudentQrClient />;
}

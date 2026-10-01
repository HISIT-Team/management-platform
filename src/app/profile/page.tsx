import type { Metadata } from 'next';
import ProfileClient from './ProfileClient';

export const metadata: Metadata = { title: { absolute: 'My profile — H-FARM International School' } };

export default function Page() {
  return <ProfileClient />;
}

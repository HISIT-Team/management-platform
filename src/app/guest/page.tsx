import type { Metadata } from 'next';
import GuestClient from './GuestClient';

export const metadata: Metadata = { title: { absolute: 'Guest — H-FARM International School' } };

export default function Page() {
  return <GuestClient />;
}

import type { Metadata } from 'next';
import LoginClient from './LoginClient';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <LoginClient />;
}

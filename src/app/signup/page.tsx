import type { Metadata } from 'next';
import SignupClient from './SignupClient';

export const metadata: Metadata = { title: 'Sign up' };

export default function SignupPage() {
  return <SignupClient />;
}

import type { Metadata } from 'next';
import OnboardingClient from './OnboardingClient';

export const metadata: Metadata = { title: { absolute: 'Onboarding — Employee Management' } };

export default function OnboardingPage() {
  return <OnboardingClient />;
}

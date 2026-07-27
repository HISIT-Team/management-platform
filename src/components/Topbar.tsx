'use client';
/* Fixed glass topbar: a home/back link on the left, Sign out on the right. */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOutUser } from '@/lib/auth';

interface TopbarProps {
  label: string;
  href: string;
  variant?: 'home' | 'back';
}

export default function Topbar({ label, href, variant = 'home' }: TopbarProps) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOutUser();
    } catch {
      /* ignore */
    }
    router.push('/');
  }

  return (
    <nav className="topbar">
      <Link className={variant === 'back' ? 'topbar-back' : 'topbar-home'} href={href}>
        <svg viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {label}
      </Link>
      <button className="btn-logout" onClick={handleSignOut}>
        Sign out
      </button>
    </nav>
  );
}

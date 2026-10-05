'use client';
/* Back / home link of a page.
   Inside the app shell it is a small breadcrumb link above the page
   content (sign out lives in the sidebar). Outside the shell it keeps the
   original fixed glass bar with Sign out. */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOutUser } from '@/lib/auth';
import { useShell } from './AppShell';

interface TopbarProps {
  label: string;
  href: string;
  variant?: 'home' | 'back';
}

export default function Topbar({ label, href, variant = 'home' }: TopbarProps) {
  const router = useRouter();
  const { inShell } = useShell();

  async function handleSignOut() {
    try {
      await signOutUser();
    } catch {
      /* ignore */
    }
    router.push('/');
  }

  if (inShell) {
    // The dashboard is one click away in the sidebar: no "‹ Home" crumb.
    if (href === '/') return null;
    return (
      <nav className="pg-crumb" aria-label="Breadcrumb">
        <Link href={href}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {label}
        </Link>
      </nav>
    );
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

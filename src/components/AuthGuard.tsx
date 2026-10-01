'use client';
/* Client-side auth guard for protected pages.
   Mirrors the original HISAuth.requireAuth(): while the session/role check is
   in flight nothing is rendered (no flash of protected content); an
   unauthenticated user is sent to /login, a wrong-role user back to /. */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkAccess } from '@/lib/auth';

export const POST_LOGIN_KEY = 'his:postLoginRedirect';

interface AuthGuardProps {
  roles?: string[];
  children: React.ReactNode;
}

export default function AuthGuard({ roles, children }: AuthGuardProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    checkAccess(roles).then((res) => {
      if (!active) return;
      if (res.status === 'ok') {
        setReady(true);
      } else if (res.status === 'unauthenticated') {
        // Remember the requested page (incl. #fragment, e.g. /qr#…) so login can send the user back.
        try {
          const { pathname, search, hash } = window.location;
          sessionStorage.setItem(POST_LOGIN_KEY, pathname + search + hash);
        } catch {
          /* storage unavailable: login falls back to the home page */
        }
        router.replace('/login');
      } else {
        router.replace('/');
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

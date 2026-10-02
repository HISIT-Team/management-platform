'use client';
/* Client-side auth guard for protected pages.
   Mirrors the original HISAuth.requireAuth(): while the session/role check is
   in flight nothing is rendered (no flash of protected content); an
   unauthenticated user is sent to /login, a user whose role requires the
   second factor (not passed yet) to /mfa, a wrong-role user back to /. */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkAccess, profileRoles } from '@/lib/auth';

/* Roles of the signed-in user, available to everything inside <AuthGuard>. */
const AccessContext = createContext<string[]>([]);

/** Renders children only for the given roles (superadmin always, admin for
    every list that contains 'admin'). Use inside <AuthGuard>. Hides UI
    only: the data behind it is protected by RLS in the database. */
export function RoleOnly({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const mine = useContext(AccessContext);
  const ok = mine.includes('superadmin') || mine.some((r) => roles.includes(r));
  return ok ? <>{children}</> : null;
}

export const POST_LOGIN_KEY = 'his:postLoginRedirect';

interface AuthGuardProps {
  roles?: string[];
  children: React.ReactNode;
}

export default function AuthGuard({ roles, children }: AuthGuardProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [myRoles, setMyRoles] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    checkAccess(roles).then((res) => {
      if (!active) return;
      if (res.status === 'ok') {
        setMyRoles(profileRoles(res.profile));
        setReady(true);
      } else if (res.status === 'unauthenticated' || res.status === 'mfa') {
        // Remember the requested page (incl. #fragment, e.g. /qr#…) so login / MFA can send the user back.
        try {
          const { pathname, search, hash } = window.location;
          sessionStorage.setItem(POST_LOGIN_KEY, pathname + search + hash);
        } catch {
          /* storage unavailable: falls back to the home page */
        }
        router.replace(res.status === 'mfa' ? '/mfa' : '/login');
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
  return <AccessContext.Provider value={myRoles}>{children}</AccessContext.Provider>;
}

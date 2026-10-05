'use client';
/* Client-side auth guard for protected pages.
   Mirrors the original HISAuth.requireAuth(): while the session/role check is
   in flight nothing is rendered (no flash of protected content); an
   unauthenticated user is sent to /login, a user whose role requires the
   second factor (not passed yet) to /mfa, a wrong-role user back to /.
   The page is rendered inside the app shell (sidebar, top bar, bottom bar
   on phones) unless `shell={false}`. The shell of the previous page is
   kept on screen while the next page checks access, so moving between
   pages doesn't flash. */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkAccess, profileName, profileRoles } from '@/lib/auth';
import { type Access, allows } from '@/lib/nav';
import AppShell, { type ShellUser } from './AppShell';

// Last signed-in user shown in the shell (navigation only, no protected data).
let lastShellUser: ShellUser | null = null;
/** A signed-in user was already shown in this tab (client-side navigation). */
export const hasShellUser = () => lastShellUser !== null;

/* Roles + permissions of the signed-in user, for everything inside <AuthGuard>. */
const AccessContext = createContext<Access>({ roles: [], perms: null });
export const useAccess = () => useContext(AccessContext);

/** Renders children only when the user has `perm` (or, before migration
    0017, one of `roles`). Owner / Super Admin always. Use inside
    <AuthGuard>. Hides UI only: the data is protected by RLS. */
export function RoleOnly({ roles = [], perm, children }: { roles?: string[]; perm?: string; children: React.ReactNode }) {
  const access = useContext(AccessContext);
  return allows(access, perm, roles) ? <>{children}</> : null;
}

export const POST_LOGIN_KEY = 'his:postLoginRedirect';

interface AuthGuardProps {
  roles?: string[];
  /** Permission needed (Gestione Backend → Permessi ruoli); `roles` is the fallback. */
  perm?: string;
  /** false: no sidebar / top bar (e.g. the guest page). */
  shell?: boolean;
  children: React.ReactNode;
}

export default function AuthGuard({ roles, perm, shell = true, children }: AuthGuardProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState<Access>({ roles: [], perms: null });
  const [shellUser, setShellUser] = useState<ShellUser | null>(lastShellUser);

  useEffect(() => {
    let active = true;
    checkAccess(roles, perm).then((res) => {
      if (!active) return;
      if (res.status === 'ok') {
        const r = profileRoles(res.profile);
        const u: ShellUser = {
          name: profileName(res.profile, res.user.email ?? ''),
          email: res.user.email ?? '',
          roles: r,
          perms: res.perms,
          avatar: typeof res.profile?.avatar === 'string' ? res.profile.avatar : null,
        };
        lastShellUser = u;
        setShellUser(u);
        setAccess({ roles: r, perms: res.perms });
        setReady(true);
      } else if (res.status === 'unauthenticated' || res.status === 'mfa') {
        lastShellUser = null;
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

  const content = ready ? <AccessContext.Provider value={access}>{children}</AccessContext.Provider> : null;
  if (!shell || !shellUser) return content;
  return <AppShell user={shellUser}>{content}</AppShell>;
}

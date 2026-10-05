'use client';
/* App shell for every signed-in page: dark sidebar (desktop), top bar
   with search and profile, and on phones a drawer + bottom tab bar.
   Rendered by <AuthGuard> around the page; the navigation is trimmed to
   the user's roles (src/lib/nav.ts). */
import React, { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import { type NavItem, canSee, isActive, isSectionActive, navFor } from '@/lib/nav';
import { signOutUser } from '@/lib/auth';

export interface ShellUser {
  name: string;
  email: string;
  roles: string[];
  avatar: string | null;
}

/* Lets Header / Topbar / Footer switch to their in-shell look. */
export const ShellContext = createContext<{ inShell: boolean; user: ShellUser | null }>({ inShell: false, user: null });
export const useShell = () => useContext(ShellContext);

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  it: 'IT',
  hr: 'HR',
  boarding: 'Boarding',
  office: 'Student Office',
  parent: 'Parent',
  guest: 'Guest',
};

export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function Avatar({ user, size = 36 }: { user: ShellUser; size?: number }) {
  return (
    <span className="sh-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {user.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar} alt="" />
      ) : (
        initialsOf(user.name)
      )}
    </span>
  );
}

function NavLink({ item, pathname, onNavigate, sub }: { item: NavItem; pathname: string; onNavigate: () => void; sub?: boolean }) {
  const active = sub ? isActive(item, pathname) : item.children?.length ? isActive(item, pathname) && !item.children.some((c) => isActive(c, pathname)) : isActive(item, pathname);
  return (
    <Link href={item.href} className={'sh-link' + (sub ? ' sub' : '') + (active ? ' on' : '')} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
      {sub ? null : <Icon name={item.icon} />}
      <span>{item.label}</span>
    </Link>
  );
}

export default function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const groups = navFor(user.roles);
  const isIt = canSee(user.roles, ['it', 'admin']);
  const role = user.roles[0] ?? '';

  // Lock the page behind the drawer while it is open (links close it on click).
  useEffect(() => {
    document.documentElement.classList.toggle('sh-lock', open);
    return () => document.documentElement.classList.remove('sh-lock');
  }, [open]);

  async function logout() {
    try {
      await signOutUser();
    } catch {
      /* ignore */
    }
    window.location.replace('/');
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (pathname.startsWith('/device-history')) window.dispatchEvent(new CustomEvent('his:search', { detail: v }));
    else router.push('/device-history?q=' + encodeURIComponent(v));
  }

  const close = () => setOpen(false);

  const sidebar = (
    <>
      <Link href="/" className="sh-brand" onClick={close}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_his_white.png" alt="H-FARM International School" />
        <span>
          <small>H-FARM School</small>
          <b>
            Management <em>Platform</em>
          </b>
        </span>
      </Link>
      <nav className="sh-nav" aria-label="Main">
        {groups.map((g, gi) => (
          <div key={gi} className="sh-group">
            {g.title ? <div className="sh-group-title">{g.title}</div> : null}
            {g.items.map((item) => (
              <React.Fragment key={item.href}>
                <NavLink item={item} pathname={pathname} onNavigate={close} />
                {item.children?.length && isSectionActive(item, pathname)
                  ? item.children.map((c) => <NavLink key={c.href} item={c} pathname={pathname} onNavigate={close} sub />)
                  : null}
              </React.Fragment>
            ))}
          </div>
        ))}
      </nav>
      <div className="sh-user">
        <Link href="/profile" className="sh-user-link" onClick={close} title="My profile">
          <Avatar user={user} />
          <span className="sh-user-name">
            <b>{user.name}</b>
            <small>{ROLE_LABEL[role] ?? role}</small>
          </span>
        </Link>
        <button type="button" className="sh-icon-btn" onClick={logout} aria-label="Sign out" title="Sign out">
          <Icon name="logout" />
        </button>
      </div>
    </>
  );

  // Bottom bar (phones): Home, the user's main sections, a central action for IT, Menu.
  const sections = groups.flatMap((g) => g.items).filter((i) => i.href !== '/');
  const tabs: { label: string; href: string; icon: React.ComponentProps<typeof Icon>['name']; primary?: boolean; active: boolean }[] = [
    { label: 'Home', href: '/', icon: 'dashboard', active: pathname === '/' },
  ];
  if (isIt) {
    tabs.push({ label: 'IT', href: '/it', icon: 'it', active: isActive({ href: '/it', match: ['/it-registries-hub', '/student-checkinout-hub', '/employee-checkinout-hub'] } as NavItem, pathname) });
    tabs.push({ label: 'Consegna', href: '/modulo-student?op=checkout', icon: 'plus', primary: true, active: pathname.startsWith('/modulo-') });
    tabs.push({ label: 'Storico', href: '/device-history', icon: 'history', active: pathname.startsWith('/device-history') });
  } else {
    sections.slice(0, 2).forEach((s) => tabs.push({ label: s.label, href: s.href, icon: s.icon, active: isSectionActive(s, pathname) }));
    tabs.push({ label: 'Profilo', href: '/profile', icon: 'user', active: pathname.startsWith('/profile') });
  }

  return (
    <ShellContext.Provider value={{ inShell: true, user }}>
      <div className="sh-app">
        <aside className="sh-side">{sidebar}</aside>

        <div className={'sh-drawer' + (open ? ' open' : '')} aria-hidden={!open}>
          <button type="button" className="sh-scrim" aria-label="Close menu" onClick={close} tabIndex={open ? 0 : -1} />
          <aside className="sh-side sh-side--drawer" role="dialog" aria-label="Menu">
            <button type="button" className="sh-icon-btn sh-drawer-close" onClick={close} aria-label="Close menu">
              <Icon name="close" />
            </button>
            {sidebar}
          </aside>
        </div>

        <div className="sh-main">
          <header className="sh-top">
            <button type="button" className="sh-icon-btn sh-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
              <Icon name="menu" />
            </button>
            <Link href="/" className="sh-top-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo_his_noback.png" alt="" />
              <b>
                Management <em>Platform</em>
              </b>
            </Link>
            {isIt ? (
              <form className="sh-search" onSubmit={search} role="search">
                <Icon name="search" size={17} />
                <label htmlFor="sh-q" className="sr-only">
                  Cerca nello storico
                </label>
                <input id="sh-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca studente, email o asset ID…" enterKeyHint="search" />
              </form>
            ) : (
              <div className="sh-spacer" />
            )}
            <Link href="/profile" className="sh-top-user" title="My profile">
              <Avatar user={user} size={34} />
              <span className="sh-top-name">
                <b>{user.name}</b>
                <small>{ROLE_LABEL[role] ?? role}</small>
              </span>
            </Link>
          </header>

          <div className="sh-content">{children}</div>
        </div>

        <nav className="sh-tabs" aria-label="Quick navigation">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className={'sh-tab' + (t.primary ? ' primary' : '') + (t.active ? ' on' : '')}>
              <span className="sh-tab-ic">
                <Icon name={t.icon} size={t.primary ? 22 : 20} />
              </span>
              {t.label}
            </Link>
          ))}
          <button type="button" className={'sh-tab' + (open ? ' on' : '')} onClick={() => setOpen(true)}>
            <span className="sh-tab-ic">
              <Icon name="menu" size={20} />
            </span>
            Menu
          </button>
        </nav>
      </div>
    </ShellContext.Provider>
  );
}

'use client';
/* App shell for every signed-in page: dark sidebar (desktop), top bar
   with search and profile, and on phones a drawer + bottom tab bar.
   Rendered by <AuthGuard> around the page; the navigation is trimmed to
   the user's roles (src/lib/nav.ts). */
import React, { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import { type NavItem, allows, isActive, isSectionActive, navFor } from '@/lib/nav';
import { signOutUser } from '@/lib/auth';
import { type UiPrefs, UI_EVENT, readUiPrefs, zoomFor } from '@/lib/uiPrefs';
import { type Company, type CompanyId, COMPANY_EVENT, companiesFor, companyOfPath, readCompany, setCompany } from '@/lib/companies';

export interface ShellUser {
  name: string;
  email: string;
  roles: string[];
  /** Permissions of the role (null: not available, roles decide). */
  perms: string[] | null;
  avatar: string | null;
}

/* Lets Header / Topbar / Footer switch to their in-shell look. */
export const ShellContext = createContext<{ inShell: boolean; user: ShellUser | null; company: Company | null; companies: Company[] }>({
  inShell: false,
  user: null,
  company: null,
  companies: [],
});
export const useShell = () => useContext(ShellContext);

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  superadmin: 'Super Admin',
  admin: 'Admin',
  it: 'IT',
  hr: 'HR',
  boarding: 'Boarding',
  office: 'Student Office',
  parent: 'Parent',
  'office.hvi': 'Office · Vicenza',
  'teachers.hvi': 'Teachers · Vicenza',
  'office.hro': 'Office · Rosà',
  'teachers.hro': 'Teachers · Rosà',
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
  // Display preferences (My profile → Aspetto) and the window width they depend on.
  const [ui, setUi] = useState<{ prefs: UiPrefs; width: number }>(() =>
    typeof window === 'undefined' ? { prefs: { size: 'auto', width: 'full' }, width: 1440 } : { prefs: readUiPrefs(), width: window.innerWidth },
  );
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setUi((u) => (u.width === window.innerWidth ? u : { ...u, width: window.innerWidth })));
    };
    const onPrefs = (e: Event) => setUi((u) => ({ ...u, prefs: (e as CustomEvent<UiPrefs>).detail }));
    window.addEventListener('resize', onResize);
    window.addEventListener(UI_EVENT, onPrefs);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener(UI_EVENT, onPrefs);
    };
  }, []);
  const zoom = zoomFor(ui.prefs, ui.width);
  const access = { roles: user.roles, perms: user.perms };

  // Company: the one of the page being viewed, else the one chosen (stored).
  const companies = companiesFor(access);
  const [storedCompany, setStoredCompany] = useState<CompanyId | null>(() => (typeof window === 'undefined' ? null : readCompany()));
  useEffect(() => {
    const on = (e: Event) => setStoredCompany((e as CustomEvent<CompanyId>).detail);
    window.addEventListener(COMPANY_EVENT, on);
    return () => window.removeEventListener(COMPANY_EVENT, on);
  }, []);
  const pathCompany = companyOfPath(pathname);
  const company = companies.find((c) => c.id === pathCompany) ?? companies.find((c) => c.id === storedCompany) ?? companies[0] ?? null;
  // Opening a page of another company switches to it.
  useEffect(() => {
    if (company && company.id !== readCompany()) setCompany(company.id);
  }, [company]);

  const groups = navFor(access, company?.id);
  const canStudentForm = allows(access, 'it.checkin_student', ['it', 'admin']) && (!company || company.id === 'venezia');
  // Device features belong to H-IS Venezia: hidden while viewing another company.
  const canHistory = allows(access, 'it.history', ['it', 'admin']) && (!company || company.id === 'venezia');
  const isIt = canStudentForm || canHistory;
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
      {companies.length > 1 ? (
        <div className="sh-companies" role="radiogroup" aria-label="Società">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={company?.id === c.id}
              className={'sh-company' + (company?.id === c.id ? ' on' : '')}
              onClick={() => {
                setCompany(c.id);
                close();
                router.push('/');
              }}
            >
              <i style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      ) : company ? (
        <div className="sh-companies single">
          <span className="sh-company on">
            <i style={{ background: company.color }} />
            {company.name}
          </span>
        </div>
      ) : null}
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
    const itSection = sections.find((s) => s.href === '/it');
    if (itSection) tabs.push({ label: 'IT', href: '/it', icon: 'it', active: isSectionActive(itSection, pathname) && !pathname.startsWith('/device-history') && !pathname.startsWith('/modulo-') });
    if (canStudentForm) tabs.push({ label: 'Consegna', href: '/modulo-student?op=checkout', icon: 'plus', primary: true, active: pathname.startsWith('/modulo-') });
    if (canHistory) tabs.push({ label: 'Storico', href: '/device-history', icon: 'history', active: pathname.startsWith('/device-history') });
  } else {
    sections.slice(0, 2).forEach((s) => tabs.push({ label: s.label, href: s.href, icon: s.icon, active: isSectionActive(s, pathname) }));
    tabs.push({ label: 'Profilo', href: '/profile', icon: 'user', active: pathname.startsWith('/profile') });
  }

  return (
    <ShellContext.Provider value={{ inShell: true, user, company, companies }}>
      <div
        className={'sh-app' + (ui.prefs.width === 'centered' ? ' sh-app--centered' : '')}
        style={{ ['--z' as string]: String(zoom), zoom: zoom === 1 ? undefined : zoom } as React.CSSProperties}
      >
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
            {canHistory ? (
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
            {company ? (
              <span className="sh-co-chip" title={company.full}>
                <i style={{ background: company.color }} />
                {company.name}
              </span>
            ) : null}
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

'use client';
/* Gestione Backend → Gestione Utenti (superadmin only).
   Lists every account of the platform (auth.users + profiles), search by
   name / surname / email, filter by role, edit name, surname and role
   (never the email) and delete accounts. All writes go through the
   superadmin-checked functions of supabase/migrations/0008_…sql. */
import React, { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { getCurrentUser } from '@/lib/auth';
import { type PlatformUser, ROLES, deleteUser, listUsers, resetUserMfa, roleMeta, updateUser } from '@/lib/users';

/* ── Icons ─────────────────────────────────────────────────────── */
const IconUsers = (
  <svg viewBox="0 0 24 24">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconSearch = (
  <svg viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconClose = (
  <svg viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconEdit = (
  <svg viewBox="0 0 24 24">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
const IconTrash = (
  <svg viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const IconRefresh = (
  <svg viewBox="0 0 24 24">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

/* ── Helpers ───────────────────────────────────────────────────── */
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Mai';
const fullName = (u: PlatformUser) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim();

function RoleTag({ role }: { role: string }) {
  const m = roleMeta(role);
  return (
    <span className="tag" style={{ ['--accent' as string]: m.color, ['--accent-soft' as string]: m.soft }}>
      {m.label}
    </span>
  );
}

interface EditState {
  user: PlatformUser;
  first: string;
  last: string;
  role: string;
}

export default function UserManagementClient() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [toDelete, setToDelete] = useState<PlatformUser | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast, toastNode } = useToast();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    getCurrentUser().then((u) => active && setMeId(u?.id ?? null));
    listUsers()
      .then((r) => active && setUsers(r))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Escape closes whichever dialog is open.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || busy) return;
      setEdit(null);
      setToDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of users) c[u.role] = (c[u.role] || 0) + 1;
    return c;
  }, [users]);
  const unconfirmed = useMemo(() => users.filter((u) => !u.email_confirmed_at).length, [users]);
  const roleChips = useMemo(
    () => [...ROLES.map((r) => r.value).filter((r) => counts[r]), ...Object.keys(counts).filter((r) => !ROLES.some((x) => x.value === r))],
    [counts],
  );

  const q = norm(query);
  const visible = useMemo(
    () =>
      users.filter(
        (u) =>
          (roleFilter === 'all' || u.role === roleFilter) &&
          (!q || norm(u.first_name).includes(q) || norm(u.last_name).includes(q) || norm(u.email).includes(q) || norm(fullName(u)).includes(q)),
      ),
    [users, roleFilter, q],
  );

  const openEdit = (u: PlatformUser) => setEdit({ user: u, first: u.first_name ?? '', last: u.last_name ?? '', role: u.role });

  const saveEdit = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await updateUser(edit.user.id, edit.first, edit.last, edit.role);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === edit.user.id
            ? { ...u, first_name: edit.first.trim() || null, last_name: edit.last.trim() || null, role: edit.role, has_profile: true }
            : u,
        ),
      );
      showToast('Utente aggiornato ✓');
      setEdit(null);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy(false);
  };

  const doResetMfa = async () => {
    if (!edit) return;
    if (!window.confirm(`Azzerare la MFA di ${edit.user.email}? Al prossimo accesso dovrà configurarla di nuovo.`)) return;
    setBusy(true);
    try {
      const n = await resetUserMfa(edit.user.id);
      setUsers((prev) => prev.map((u) => (u.id === edit.user.id ? { ...u, mfa_enabled: false } : u)));
      setEdit({ ...edit, user: { ...edit.user, mfa_enabled: false } });
      showToast(n ? 'MFA azzerata ✓' : 'Nessuna app di autenticazione da rimuovere');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteUser(toDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== toDelete.id));
      showToast('Utente eliminato ✓');
      setToDelete(null);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy(false);
  };

  return (
    <AuthGuard roles={['superadmin']}>
      <Topbar label="Gestione Backend" href="/backend" variant="back" />
      <div className="budget-page um-page">
        <div className="shell">
          {/* ── Head ── */}
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconUsers}</div>
              <div>
                <p className="b-eyebrow">Gestione Backend · Super Admin</p>
                <h1>
                  Gestione <em>Utenti</em>
                </h1>
                <p>Tutti gli account della piattaforma, i loro ruoli e i dati del profilo</p>
              </div>
            </div>
            <button className="btn-quiet" onClick={load} disabled={loading}>
              {IconRefresh}
              Aggiorna
            </button>
          </div>

          {error ? (
            <div className="setup-note">
              <b>Utenti non raggiungibili.</b> {error}
              <br />
              Verifica di aver eseguito <code>0007</code> e <code>0008</code> di <code>supabase/migrations/</code> nel SQL Editor e
              che il tuo profilo abbia ruolo <code>superadmin</code>.
            </div>
          ) : null}

          {/* ── Overview ── */}
          {loading ? (
            <div className="skeleton" />
          ) : (
            <section className="hero">
              <div className="stat-row um-stats">
                <div className="stat">
                  <div className="stat-lbl">Utenti</div>
                  <div className="stat-val">{users.length}</div>
                  <div className="stat-sub">account registrati</div>
                </div>
                <div className={'stat' + (counts.guest ? ' is-spent' : '')}>
                  <div className="stat-lbl">Guest in attesa</div>
                  <div className="stat-val">{counts.guest || 0}</div>
                  <div className="stat-sub">da abilitare con un ruolo</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Amministratori</div>
                  <div className="stat-val">{(counts.superadmin || 0) + (counts.admin || 0)}</div>
                  <div className="stat-sub">
                    {counts.superadmin || 0} Super Admin · {counts.admin || 0} Admin
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Email non confermate</div>
                  <div className="stat-val">{unconfirmed}</div>
                  <div className="stat-sub">registrazione da completare</div>
                </div>
              </div>
            </section>
          )}

          {/* ── Search & filters ── */}
          <h2 className="section-label">Utenti</h2>
          <div className="dh-search">
            {IconSearch}
            <input
              type="text"
              placeholder="Cerca per nome, cognome o email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cerca utenti per nome, cognome o email"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button className="icon-btn" onClick={() => setQuery('')} aria-label="Cancella ricerca" title="Cancella">
                {IconClose}
              </button>
            ) : null}
          </div>

          <div className="filters dh-filters">
            <button className={'fchip' + (roleFilter === 'all' ? ' active' : '')} onClick={() => setRoleFilter('all')}>
              Tutti i ruoli · {users.length}
            </button>
            {roleChips.map((r) => (
              <button key={r} className={'fchip' + (roleFilter === r ? ' active' : '')} onClick={() => setRoleFilter(r)}>
                <i className="legend-dot" style={{ background: roleMeta(r).color }} />
                {roleMeta(r).label} · {counts[r]}
              </button>
            ))}
            <span className="dh-count">
              {visible.length} {visible.length === 1 ? 'risultato' : 'risultati'}
            </span>
          </div>

          {/* ── Table ── */}
          <div className="ledger">
            {loading ? (
              <div className="empty">
                <p>Caricamento utenti…</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">{IconUsers}</div>
                <h3>{users.length === 0 ? 'Nessun utente' : 'Nessun risultato'}</h3>
                <p>{users.length === 0 ? 'Non ci sono account da mostrare.' : 'Prova con un altro nome o email, oppure togli il filtro ruolo.'}</p>
              </div>
            ) : (
              <div className="ledger-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Utente</th>
                      <th>Email</th>
                      <th>Ruolo</th>
                      <th>MFA</th>
                      <th>Registrato</th>
                      <th>Ultimo accesso</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((u) => {
                      const me = u.id === meId;
                      return (
                        <tr key={u.id}>
                          <td className="col-desc">
                            <div className="desc">
                              {fullName(u) || <span className="dh-none">Senza nome</span>}
                              {me ? <span className="um-me">tu</span> : null}
                            </div>
                          </td>
                          <td>
                            <div>{u.email}</div>
                            {!u.email_confirmed_at ? <div className="um-warn">Email non confermata</div> : null}
                          </td>
                          <td>
                            <RoleTag role={u.role} />
                          </td>
                          <td>
                            <span className={'um-mfa' + (u.mfa_enabled ? ' on' : '')}>{u.mfa_enabled ? 'Attiva' : '—'}</span>
                          </td>
                          <td className="col-date">{fmtDate(u.created_at)}</td>
                          <td className="col-date">{fmtDateTime(u.last_sign_in_at)}</td>
                          <td className="col-actions um-actions">
                            <button className="icon-btn um-edit" title="Modifica utente" aria-label={`Modifica ${u.email}`} onClick={() => openEdit(u)}>
                              {IconEdit}
                            </button>
                            <button
                              className="icon-btn"
                              title={me ? 'Non puoi eliminare il tuo account' : 'Elimina utente'}
                              aria-label={`Elimina ${u.email}`}
                              onClick={() => setToDelete(u)}
                              disabled={me}
                            >
                              {IconTrash}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <footer className="b-footer">
            H-FARM International School · Gestione Backend — Gestione Utenti
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>

        {/* ── Edit dialog ── */}
        {edit ? (
          <div
            className="b-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Modifica utente"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setEdit(null);
            }}
          >
            <div className="b-modal" style={{ maxWidth: 460 }}>
              <div className="b-modal-head">
                <div className="mi">{IconEdit}</div>
                <div>
                  <h2>Modifica utente</h2>
                  <p>L&apos;email non si può modificare</p>
                </div>
              </div>
              <div className="b-modal-body">
                <div className="field">
                  <label htmlFor="um-email">Email</label>
                  <input id="um-email" type="text" value={edit.user.email} disabled readOnly />
                </div>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="um-first">Nome</label>
                    <input id="um-first" type="text" value={edit.first} onChange={(e) => setEdit({ ...edit, first: e.target.value })} autoFocus />
                  </div>
                  <div className="field">
                    <label htmlFor="um-last">Cognome</label>
                    <input id="um-last" type="text" value={edit.last} onChange={(e) => setEdit({ ...edit, last: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="um-role">Ruolo</label>
                  <select
                    id="um-role"
                    value={edit.role}
                    onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                    disabled={edit.user.id === meId}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {edit.user.id === meId ? <p className="um-hint">Non puoi cambiare il tuo ruolo di Super Admin.</p> : null}
                  {edit.role === 'superadmin' && edit.user.id !== meId ? (
                    <p className="um-hint um-hint--warn">Il Super Admin ha accesso completo, compresa la gestione degli utenti.</p>
                  ) : null}
                </div>
                <div className="field um-mfa-field">
                  <label>Autenticazione a due fattori</label>
                  <div className="um-mfa-row">
                    <span className={'um-mfa' + (edit.user.mfa_enabled ? ' on' : '')}>{edit.user.mfa_enabled ? 'Attiva' : 'Non attiva'}</span>
                    {edit.user.mfa_enabled ? (
                      <button type="button" className="btn-quiet" onClick={doResetMfa} disabled={busy}>
                        Azzera MFA (telefono perso)
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="b-modal-foot">
                <button className="btn-quiet" onClick={() => setEdit(null)} disabled={busy}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={saveEdit} disabled={busy}>
                  {busy ? 'Salvataggio…' : 'Salva'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Delete confirmation ── */}
        {toDelete ? (
          <div
            className="b-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Conferma eliminazione utente"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setToDelete(null);
            }}
          >
            <div className="b-modal" style={{ maxWidth: 440 }}>
              <div className="b-modal-head">
                <div className="mi">{IconTrash}</div>
                <div>
                  <h2>Eliminare l&apos;utente?</h2>
                  <p>L&apos;operazione non si può annullare</p>
                </div>
              </div>
              <div className="b-modal-body">
                <p className="confirm-text">
                  <strong>{fullName(toDelete) || toDelete.email}</strong> ({toDelete.email}) — ruolo {roleMeta(toDelete.role).label}.
                  L&apos;account e il profilo vengono eliminati: l&apos;utente non potrà più accedere e dovrà registrarsi di nuovo.
                </p>
              </div>
              <div className="b-modal-foot">
                <button className="btn-quiet" onClick={() => setToDelete(null)} disabled={busy}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={confirmDelete} disabled={busy}>
                  {busy ? 'Eliminazione…' : 'Elimina'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {toastNode}
      </div>

      <style>{`
        .um-page .um-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .um-page .dh-search {
          display: flex; align-items: center; gap: 10px; margin-bottom: .8rem;
          background: var(--b-surface); border: 1.5px solid #E4DCDD; border-radius: 999px;
          padding: 4px 8px 4px 16px; box-shadow: var(--b-shadow); transition: border-color .15s, box-shadow .15s;
        }
        .um-page .dh-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 4px rgba(139, 26, 43, .08); }
        .um-page .dh-search > svg { width: 18px; height: 18px; flex-shrink: 0; stroke: var(--b-faint); fill: none; stroke-width: 2; stroke-linecap: round; }
        .um-page .dh-search input[type=text] { flex: 1; border: none; background: transparent; padding: 10px 0; box-shadow: none; font-size: 15px; }
        .um-page .dh-search .icon-btn:hover { background: var(--b-soft); color: var(--brand); }
        .um-page .dh-filters { align-items: center; }
        .um-page .dh-count { margin-left: auto; font-size: 12.5px; color: var(--b-muted); font-weight: 600; }
        .um-page .dh-none { color: var(--b-muted); font-weight: 500; font-style: italic; }
        .um-page tbody td { white-space: nowrap; }
        .um-page .um-me { margin-left: 8px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--brand); background: var(--brand-light); border-radius: 999px; padding: 2px 8px; }
        .um-page .um-warn { font-size: 11.5px; color: var(--b-warn); font-weight: 600; margin-top: 2px; }
        .um-page td.um-actions { width: 84px; text-align: right; }
        .um-page .icon-btn.um-edit:hover { background: var(--brand-light); color: var(--brand); }
        .um-page .icon-btn:disabled { opacity: .3; cursor: not-allowed; background: transparent; color: var(--b-faint); }
        .um-page .um-hint { font-size: 12px; color: var(--b-muted); margin-top: 6px; }
        .um-page .um-mfa { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--b-faint); }
        .um-page .um-mfa.on { color: #3B6D11; background: #EAF3DE; border-radius: 999px; padding: 3px 9px; }
        .um-page .um-mfa-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .um-page .um-hint--warn { color: var(--b-warn); font-weight: 600; }
        .um-page .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .um-page input:disabled { opacity: .7; cursor: not-allowed; }
        @media (max-width: 860px) { .um-page .um-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 520px) { .um-page .row2 { grid-template-columns: 1fr; } }
      `}</style>
    </AuthGuard>
  );
}

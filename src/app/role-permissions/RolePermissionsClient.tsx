'use client';
/* Gestione Backend → Permessi ruoli (Owner and Super Admin).
   A matrix permission × role: tick what each role can see and use.
   Owner and Super Admin always have everything; Guest nothing. Changes
   apply at the users' next page load, are enforced in the database too
   (migration 0017) and are written to the activity log. */
import React, { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { CONFIGURABLE_ROLES, PERMISSIONS, listRolePermissions, setRolePermission } from '@/lib/permissions';
import { roleMeta } from '@/lib/users';

const IconSliders = (
  <svg viewBox="0 0 24 24">
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1 14h6M9 8h6M17 16h6" />
  </svg>
);

const LOCKED_ROLES = ['owner', 'superadmin'];

export default function RolePermissionsClient() {
  const { showToast, toastNode } = useToast();
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    listRolePermissions()
      .then((m) => active && setMatrix(m))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => {
    const out: { name: string; items: typeof PERMISSIONS }[] = [];
    for (const p of PERMISSIONS) {
      let g = out.find((x) => x.name === p.group);
      if (!g) out.push((g = { name: p.group, items: [] }));
      g.items.push(p);
    }
    return out;
  }, []);

  const has = (role: string, perm: string) => matrix[role]?.has(perm) ?? false;

  async function toggle(role: string, perm: string) {
    const next = !has(role, perm);
    const key = role + ':' + perm;
    setBusy(key);
    try {
      await setRolePermission(role, perm, next);
      setMatrix((prev) => {
        const copy: Record<string, Set<string>> = { ...prev, [role]: new Set(prev[role] ?? []) };
        if (next) copy[role].add(perm);
        else copy[role].delete(perm);
        return copy;
      });
      const label = PERMISSIONS.find((p) => p.key === perm)?.label ?? perm;
      showToast(`${roleMeta(role).label}: ${label} ${next ? 'abilitato ✓' : 'disabilitato'}`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy('');
  }

  // A whole section for a role at once.
  async function setSection(role: string, group: string, value: boolean) {
    const keys = PERMISSIONS.filter((p) => p.group === group).map((p) => p.key).filter((k) => has(role, k) !== value);
    for (const k of keys) await toggle(role, k);
  }

  return (
    <AuthGuard roles={['superadmin']}>
      <Topbar label="Gestione Backend" href="/backend" variant="back" />
      <div className="budget-page rp-page">
        <div className="shell">
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconSliders}</div>
              <div>
                <p className="b-eyebrow">Gestione Backend · Owner e Super Admin</p>
                <h1>
                  Permessi <em>ruoli</em>
                </h1>
                <p>Cosa può vedere e usare ogni ruolo. Owner e Super Admin hanno sempre accesso completo.</p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="setup-note">
              <b>Permessi non raggiungibili.</b> {error}
              <br />
              Verifica di aver eseguito <code>0017_owner_and_role_permissions.sql</code> nel SQL Editor.
            </div>
          ) : null}

          {loading ? (
            <div className="skeleton" />
          ) : error ? null : (
            <div className="ledger">
              <div className="ledger-scroll">
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th className="rp-perm">Permesso</th>
                      {LOCKED_ROLES.map((r) => (
                        <th key={r} className="rp-role rp-locked" title="Sempre accesso completo">
                          {roleMeta(r).label}
                        </th>
                      ))}
                      {CONFIGURABLE_ROLES.map((r) => (
                        <th key={r} className="rp-role">
                          {roleMeta(r).label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <React.Fragment key={g.name}>
                        <tr className="rp-group">
                          <td>{g.name}</td>
                          {LOCKED_ROLES.map((r) => (
                            <td key={r} />
                          ))}
                          {CONFIGURABLE_ROLES.map((r) => {
                            const all = g.items.every((p) => has(r, p.key));
                            return (
                              <td key={r} className="rp-cell">
                                <button type="button" className="rp-all" onClick={() => setSection(r, g.name, !all)} disabled={!!busy}>
                                  {all ? 'Nessuno' : 'Tutti'}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                        {g.items.map((p) => (
                          <tr key={p.key}>
                            <td className={'rp-perm' + (p.sub ? ' sub' : '')}>
                              <b>{p.label}</b>
                              <small>{p.desc}</small>
                            </td>
                            {LOCKED_ROLES.map((r) => (
                              <td key={r} className="rp-cell">
                                <span className="rp-check on locked" aria-label="Sempre consentito">
                                  ✓
                                </span>
                              </td>
                            ))}
                            {CONFIGURABLE_ROLES.map((r) => {
                              const on = has(r, p.key);
                              return (
                                <td key={r} className="rp-cell">
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={on}
                                    aria-label={`${p.label} per ${roleMeta(r).label}`}
                                    className={'rp-check' + (on ? ' on' : '')}
                                    onClick={() => toggle(r, p.key)}
                                    disabled={busy === r + ':' + p.key}
                                  >
                                    {on ? '✓' : ''}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="rp-note">
            La &laquo;Sezione&raquo; mostra la pagina e la voce nel menu; le righe sotto aprono le singole funzioni. Le modifiche
            valgono dal prossimo caricamento di pagina degli utenti e sono applicate anche nel database (storico, budget, task e form).
            Gestione Utenti, Registro attività, Sicurezza e questa pagina restano solo per Owner e Super Admin. Ogni modifica finisce
            nel Registro attività.
          </p>
        </div>
        {toastNode}
      </div>
      <style>{`
        .rp-page .rp-table { min-width: 860px; }
        .rp-page .rp-table th.rp-role { text-align: center; white-space: nowrap; }
        .rp-page .rp-table th.rp-locked { color: var(--b-faint); }
        .rp-page .rp-perm { min-width: 280px; }
        .rp-page .rp-perm b { display: block; font-size: 13.5px; font-weight: 700; }
        .rp-page .rp-perm small { display: block; font-size: 12px; color: var(--b-muted); font-weight: 500; }
        .rp-page .rp-perm.sub { padding-left: 34px; }
        .rp-page .rp-group td { background: #FBF9F8; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--brand); }
        .rp-page .rp-cell { text-align: center; }
        .rp-page .rp-check { width: 28px; height: 28px; border-radius: 8px; border: 1.5px solid #D9CED0; background: #fff; color: #fff; font-weight: 800; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .rp-page .rp-check.on { background: var(--brand); border-color: var(--brand); }
        .rp-page .rp-check.locked { background: #E9E2E3; border-color: #E9E2E3; color: #8C8086; cursor: default; }
        .rp-page .rp-check:disabled { opacity: .5; }
        .rp-page .rp-check:focus-visible, .rp-page .rp-all:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        .rp-page .rp-all { border: none; background: none; font: inherit; font-size: 11.5px; font-weight: 700; color: var(--brand); cursor: pointer; text-transform: none; letter-spacing: 0; }
        .rp-page .rp-note { font-size: 13px; color: var(--b-muted); line-height: 1.55; margin-top: 1rem; max-width: 900px; }
      `}</style>
    </AuthGuard>
  );
}

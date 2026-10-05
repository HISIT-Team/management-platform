'use client';
/* Shared platform header.
   - Outside the app shell (login, sign-up, MFA…): centred logo, eyebrow,
     split title, optional subtitle.
   - Inside the shell: a compact, left-aligned page title (the logo is
     already in the sidebar). */
import React from 'react';
import { useShell } from './AppShell';

interface HeaderProps {
  titlePre: string;
  titleSpan: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Header({ titlePre, titleSpan, subtitle, actions }: HeaderProps) {
  const { inShell } = useShell();
  if (inShell) {
    return (
      <header className="pg-head">
        <div>
          <h1 className="pg-title">
            {titlePre}
            <span>{titleSpan}</span>
          </h1>
          {subtitle ? <p className="pg-sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="pg-actions">{actions}</div> : null}
      </header>
    );
  }
  return (
    <header className="header">
      <div className="logo-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_his_noback.png" alt="H-FARM International School" />
      </div>
      <p className="title-eyebrow">H-FARM International School</p>
      <h1 className="title-main">
        {titlePre}
        <span>{titleSpan}</span>
      </h1>
      {subtitle ? <p className="title-sub">{subtitle}</p> : null}
      <div className="divider"></div>
    </header>
  );
}

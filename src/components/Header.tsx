/* Shared platform header: logo, eyebrow, split title, optional subtitle, divider. */
import React from 'react';

interface HeaderProps {
  titlePre: string;
  titleSpan: string;
  subtitle?: string;
}

export default function Header({ titlePre, titleSpan, subtitle }: HeaderProps) {
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

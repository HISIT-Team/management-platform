/* Data-driven hub page: renders the topbar, header, a grid of cards and the
   footer — the exact structure shared by every hub in the platform.
   Each hub route just passes a HubConfig from src/lib/hubs.tsx. */
import React from 'react';
import Link from 'next/link';
import Header from './Header';
import Footer from './Footer';
import Topbar from './Topbar';
import AuthGuard from './AuthGuard';

export interface HubCard {
  icon: React.ReactNode;
  name: string;
  desc: string;
  href: string;
  external?: boolean;
  badge?: { text: string; soon?: boolean };
}

export interface HubConfig {
  roles: string[];
  topbar: { label: string; href: string; variant?: 'home' | 'back' };
  titlePre: string;
  titleSpan: string;
  subtitle?: string;
  footer: string;
  cards: HubCard[];
}

const arrow = (
  <svg viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

function CardInner({ card }: { card: HubCard }) {
  return (
    <>
      <div className="card-icon">{card.icon}</div>
      <div className="card-content">
        <div className="card-name">{card.name}</div>
        <div className="card-desc">{card.desc}</div>
        {card.badge ? (
          <div className={'card-badge' + (card.badge.soon ? ' card-badge--soon' : '')}>{card.badge.text}</div>
        ) : null}
      </div>
      <div className="card-arrow">{arrow}</div>
    </>
  );
}

function Card({ card }: { card: HubCard }) {
  if (card.external) {
    return (
      <a className="card" href={card.href} target="_blank" rel="noopener">
        <CardInner card={card} />
      </a>
    );
  }
  return (
    <Link className="card" href={card.href}>
      <CardInner card={card} />
    </Link>
  );
}

export default function HubPage({ config }: { config: HubConfig }) {
  return (
    <AuthGuard roles={config.roles}>
      <Topbar label={config.topbar.label} href={config.topbar.href} variant={config.topbar.variant} />
      <div className="page">
        <Header titlePre={config.titlePre} titleSpan={config.titleSpan} subtitle={config.subtitle} />
        <main className="cards">
          {config.cards.map((card, i) => (
            <Card key={i} card={card} />
          ))}
        </main>
        <Footer text={config.footer} />
      </div>
    </AuthGuard>
  );
}

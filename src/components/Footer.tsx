/* Shared platform footer with the school address line and, when configured,
   the link to the privacy notice (src/lib/features.ts). */
import React from 'react';
import { PRIVACY_POLICY_URL } from '@/lib/features';

export default function Footer({ text }: { text: string }) {
  return (
    <footer className="footer">
      {text}
      <span className="footer-address">Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
      {PRIVACY_POLICY_URL ? (
        <a className="footer-privacy" href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
          Privacy policy / Informativa privacy
        </a>
      ) : null}
    </footer>
  );
}

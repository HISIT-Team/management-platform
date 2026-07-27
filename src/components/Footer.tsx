/* Shared platform footer with the school address line. */
import React from 'react';

export default function Footer({ text }: { text: string }) {
  return (
    <footer className="footer">
      {text}
      <span className="footer-address">Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
    </footer>
  );
}

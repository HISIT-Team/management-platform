import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';
const SUPABASE = 'https://gnahighyfoirnadhihez.supabase.co';

// Content-Security-Policy — ported from the original Netlify `_headers`.
// In development we relax script-src ('unsafe-eval') and connect-src (ws:) so
// Next.js Fast Refresh / HMR keeps working; production stays strict.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src \'self\' https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  `connect-src 'self' ${SUPABASE} https://challenges.cloudflare.com${isDev ? ' ws: http://localhost:*' : ''}`,
  'frame-src https://challenges.cloudflare.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

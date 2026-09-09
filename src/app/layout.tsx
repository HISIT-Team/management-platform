import type { Metadata, Viewport } from 'next';
import './globals.css';
import './forms.css';
import './budget.css';
import './tasks.css';

export const metadata: Metadata = {
  title: {
    default: 'H-FARM International School — Management Platform',
    template: '%s — H-FARM International School',
  },
  description: 'H-Farm International School Management Platform',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/logo-web.ico', sizes: 'any' },
      { url: '/logo-web-96.png', type: 'image/png' },
    ],
    apple: '/his-mp-180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#8B1A2B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

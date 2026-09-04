import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RivalLens',
  description: 'Evidence-backed competitive intelligence for D2C brands.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

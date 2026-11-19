import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Afterhours',
  description: 'A night crew of Grok Bots that finds where your business leaks money, drafts the fixes, and texts you.',
};

// Fonts (Geist, Geist Mono, Chakra Petch) load from each artboard's <helmet>, like on the canvas.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;800&family=Geist+Mono:wght@400;500;600&family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

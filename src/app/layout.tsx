import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Integraciones · almuerzo.cl', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body><main>{children}</main></body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { CartProvider } from '@/components/CartProvider';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Backeri — Artisan Bakery Ordering & Kitchen Operations',
  description:
    'Small-batch sourdough, French viennoiserie, and bespoke celebration cakes with real-time kitchen slot scheduling.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cream text-espresso">
        <AuthProvider>
          <CartProvider>
            <Navbar />
            {children}
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

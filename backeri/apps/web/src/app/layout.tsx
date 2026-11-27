import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { CartProvider } from '@/components/CartProvider';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Backeri — Neighborhood Bakery & Express Cake Delivery',
  description:
    'Order same-day custom eggless cakes, warm croissants, sourdough, and cafe combos in under 45 seconds.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface font-sans text-ink">
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

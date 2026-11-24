import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import SessionNotice from '@/components/auth/SessionNotice';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Caffeinawa',
    template: '%s | Caffeinawa',
  },
  description: 'Discover handcrafted coffee made for every kind of coffee moment.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <AuthProvider>
            <a
              href="#page-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-cafe-primary focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-cafe-on-primary"
            >
              Skip to content
            </a>

            <Header />
            <SessionNotice />

            <div
              id="page-content"
              tabIndex={-1}
              className="flex min-w-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-cafe-accent focus-visible:outline-offset-[-2px]"
            >
              {children}
            </div>
            <Footer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

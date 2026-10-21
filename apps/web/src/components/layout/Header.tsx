'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);

  const { customer, isAuthenticated, isLoading, logout } = useAuth();

  const normalizedPath = pathname?.replace(/\/+$/, '') || '/';
  const hasSession = !isLoading && isAuthenticated && customer !== null;

  const links = [
    { href: '/', label: 'Home' },
    { href: '/menu', label: 'Menu' },
    ...(!isLoading
      ? hasSession
        ? [
            { href: '/account', label: 'Account' },
            ...(customer?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : []),
          ]
        : [
            { href: '/login', label: 'Sign in' },
            { href: '/register', label: 'Create account' },
          ]
      : []),
  ];

  function isActive(href: string) {
    return normalizedPath === href || (href === '/admin' && normalizedPath.startsWith('/admin/'));
  }

  function closeMobileMenu() {
    if (mobileMenuRef.current) {
      mobileMenuRef.current.open = false;
    }
  }

  function handleLogout() {
    closeMobileMenu();
    logout();
    router.replace('/');
  }

  return (
    <header className="relative z-30 border-b border-cafe-border bg-cafe-cream text-cafe-espresso">
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link
          href="/"
          onClick={closeMobileMenu}
          className="shrink-0 font-display text-2xl font-bold tracking-[-0.06em] sm:text-3xl"
        >
          Caffeinawa
        </Link>

        <nav aria-label="Main navigation" className="hidden md:block">
          <ul className="flex items-center gap-6 lg:gap-8">
            {links.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center border-b-2 text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? 'border-cafe-accent text-cafe-espresso'
                      : 'border-transparent text-cafe-muted hover:text-cafe-espresso'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}

            {hasSession && (
              <li>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-h-11 text-sm font-medium text-cafe-muted transition-colors hover:text-cafe-espresso"
                >
                  Sign out
                </button>
              </li>
            )}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {hasSession && (
            <Link
              href="/cart"
              onClick={closeMobileMenu}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cafe-espresso px-4 text-sm font-medium text-white transition-colors hover:bg-cafe-brown"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="h-5 w-5"
              >
                <path d="M3 4h2l2.5 11h10.8l2-8H6" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="20" r="1" />
                <circle cx="18" cy="20" r="1" />
              </svg>
              Cart
            </Link>
          )}

          <details
            ref={mobileMenuRef}
            className="relative md:hidden"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                closeMobileMenu();
                mobileMenuRef.current?.querySelector('summary')?.focus();
              }
            }}
          >
            <summary
              aria-label="Navigation"
              className="cafe-menu-toggle flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-cafe-border transition-colors hover:bg-cafe-soft"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="h-5 w-5"
              >
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </summary>

            <nav
              aria-label="Mobile navigation"
              className="absolute right-0 top-full mt-3 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-cafe-border bg-cafe-paper p-2 shadow-xl shadow-cafe-espresso/10"
            >
              <ul>
                {links.map(link => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={closeMobileMenu}
                      aria-current={isActive(link.href) ? 'page' : undefined}
                      className={`flex min-h-12 items-center rounded-xl px-4 text-sm font-medium ${
                        isActive(link.href) ? 'bg-cafe-soft text-cafe-espresso' : 'text-cafe-muted hover:bg-cafe-cream'
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}

                {hasSession && (
                  <li className="mt-2 border-t border-cafe-border pt-2">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex min-h-12 w-full items-center rounded-xl px-4 text-left text-sm font-medium text-cafe-muted hover:bg-cafe-cream"
                    >
                      Sign out
                    </button>
                  </li>
                )}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

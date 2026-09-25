'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';

export function Header() {
  const router = useRouter();
  const { customer, isAuthenticated, isLoading, logout } = useAuth();

  function handleLogout() {
    logout();
    router.replace('/');
  }

  return (
    <header className="border-b border-black/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Caffeinawa
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-6 text-sm font-medium">
            <li>
              <Link href="/" className="transition-opacity hover:opacity-60">
                Home
              </Link>
            </li>

            <li>
              <Link href="/menu" className="transition-opacity hover:opacity-60">
                Menu
              </Link>
            </li>

            {!isLoading && !isAuthenticated && (
              <>
                <li>
                  <Link href="/login" className="transition-opacity hover:opacity-60">
                    Sign in
                  </Link>
                </li>

                <li>
                  <Link
                    href="/register"
                    className="rounded-lg bg-black px-4 py-2 text-white transition-opacity hover:opacity-80"
                  >
                    Create account
                  </Link>
                </li>
              </>
            )}

            {!isLoading && isAuthenticated && customer && (
              <>
                <li>
                  <Link href="/account" className="transition-opacity hover:opacity-60">
                    {customer.name}
                  </Link>
                </li>

                <li>
                  <button type="button" onClick={handleLogout} className="transition-opacity hover:opacity-60">
                    Sign out
                  </button>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

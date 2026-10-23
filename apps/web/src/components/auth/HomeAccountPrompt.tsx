'use client';

import Link from 'next/link';

import { useAuth } from '@/components/auth/AuthProvider';

export default function HomeAccountPrompt() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || isAuthenticated) {
    return null;
  }

  return (
    <p className="mt-6 text-sm leading-6 text-cafe-muted">
      Already have an account?{' '}
      <Link href="/login" className="inline-block py-2 font-semibold text-cafe-accent underline underline-offset-4">
        Sign in
      </Link>{' '}
      when you&apos;re ready to order.
    </p>
  );
}

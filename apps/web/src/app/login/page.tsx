'use client';

import { Suspense, useEffect, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';
import AuthShell from '@/components/auth/AuthShell';
import FormField from '@/components/ui/FormField';
import { getSafeReturnPath } from '@/lib/auth-redirect';

type FormSubmitHandler = NonNullable<ComponentProps<'form'>['onSubmit']>;

const inputClassName =
  'mt-2 min-h-12 w-full rounded-xl border border-cafe-border bg-white px-4 py-3 text-base text-cafe-espresso placeholder:text-cafe-muted';

function SessionLoading() {
  return (
    <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16">
      <p role="status" className="text-sm text-cafe-muted">
        Checking your session...
      </p>
    </main>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading } = useAuth();

  const destination = getSafeReturnPath(searchParams.get('next'));
  const registrationCompleted = searchParams.get('registered') === '1';

  const registerHref = `/register?next=${encodeURIComponent(destination)}`;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(destination);
    }
  }, [destination, isAuthenticated, isLoading, router]);

  const handleSubmit: FormSubmitHandler = async event => {
    event.preventDefault();

    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      await login({
        email: email.trim(),
        password,
      });

      // AuthProvider updates authentication state.
      // The effect above handles navigation.
    } catch {
      setError('Unable to sign in. Check your email and password, then try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return <SessionLoading />;
  }

  return (
    <AuthShell eyebrow="Your usual awaits" title="Welcome back." description="Sign in to pick up where you left off.">
      {registrationCompleted && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-800"
        >
          Your account has been created. Sign in to continue.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField htmlFor="email" label="Email address">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={isSubmitting}
            value={email}
            onChange={event => setEmail(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField htmlFor="password" label="Password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isSubmitting}
            value={password}
            onChange={event => setPassword(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-cafe-espresso px-5 text-sm font-semibold text-white hover:bg-cafe-brown disabled:cursor-wait disabled:opacity-50"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="mt-7 text-center text-sm leading-7 text-cafe-muted">
        New to Caffeinawa?{' '}
        <Link
          href={registerHref}
          className="inline-block py-2 font-semibold text-cafe-accent underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<SessionLoading />}>
      <LoginContent />
    </Suspense>
  );
}

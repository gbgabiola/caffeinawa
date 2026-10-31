'use client';

import { Suspense, useEffect, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';
import AuthShell from '@/components/auth/AuthShell';
import FormField from '@/components/ui/FormField';
import { AuthRequestError } from '@/lib/api/auth';
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

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isAuthenticated, isLoading } = useAuth();

  const destination = getSafeReturnPath(searchParams.get('next'));
  const loginHref = `/login?next=${encodeURIComponent(destination)}`;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      router.replace(`${loginHref}&registered=1`);
    } catch (error) {
      setError(
        error instanceof AuthRequestError && error.status === 429
          ? error.message
          : 'Unable to create your account. Check your information and try again.',
      );

      setIsSubmitting(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return <SessionLoading />;
  }

  return (
    <AuthShell
      eyebrow="Make yourself at home"
      title="Your coffee journey starts here."
      description="Create an account to save your details and place your order."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField htmlFor="name" label="Name">
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            disabled={isSubmitting}
            value={name}
            onChange={event => setName(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField htmlFor="email" label="Email address">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={255}
            disabled={isSubmitting}
            value={email}
            onChange={event => setEmail(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField htmlFor="password" label="Password" description="Use between 8 and 128 characters.">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            disabled={isSubmitting}
            aria-describedby="password-description"
            value={password}
            onChange={event => setPassword(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField htmlFor="confirmPassword" label="Confirm password">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            disabled={isSubmitting}
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
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
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-7 text-center text-sm leading-7 text-cafe-muted">
        Already have an account?{' '}
        <Link
          href={loginHref}
          className="inline-block py-2 font-semibold text-cafe-accent underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<SessionLoading />}>
      <RegisterContent />
    </Suspense>
  );
}

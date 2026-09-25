'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';

type FormSubmitHandler = NonNullable<React.ComponentProps<'form'>['onSubmit']>;

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-gray-600">Checking your session...</p>
      </main>
    );
  }

  const handleSubmit: FormSubmitHandler = async event => {
    event.preventDefault();

    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        name,
        email,
        password,
      });

      router.replace('/login');
    } catch {
      setError('Unable to create your account. Please check your information and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Create your account</h1>

          <p className="mt-3 text-gray-600">Join Caffeinawa and make your next coffee moment count.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Name
            </label>

            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={100}
              value={name}
              onChange={event => setName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-black/15 px-4 py-3 outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-black/15 px-4 py-3 outline-none transition focus:border-black"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-black/15 px-4 py-3 outline-none transition focus:border-black"
            />

            <p className="mt-2 text-xs text-gray-500">Password must be between 8 and 128 characters.</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium">
              Confirm password
            </label>

            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-black/15 px-4 py-3 outline-none transition focus:border-black"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-black px-5 py-3 font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-black underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

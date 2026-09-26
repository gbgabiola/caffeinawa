'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { LoginCustomer, UpdateCustomerInput } from '@/lib/api/auth';

import { useAuth } from '@/components/auth/AuthProvider';

type FormSubmitHandler = NonNullable<React.ComponentProps<'form'>['onSubmit']>;

interface AccountFormProps {
  customer: LoginCustomer;
  updateCustomer: (input: UpdateCustomerInput) => Promise<void>;
}

function AccountForm({ customer, updateCustomer }: AccountFormProps) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit: FormSubmitHandler = async event => {
    event.preventDefault();

    setMessage('');
    setError('');
    setIsSaving(true);

    try {
      await updateCustomer({
        name,
        email,
      });

      setMessage('Your profile has been updated.');
    } catch {
      setError('Unable to update your profile. Please check your information and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  function handleCancel() {
    setName(customer.name);
    setEmail(customer.email);
    setMessage('');
    setError('');
  }

  return (
    <div className="rounded-2xl border border-black/10 p-6 sm:p-8">
      <form onSubmit={handleSubmit} className="space-y-6">
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

        {message && (
          <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-black px-5 py-3 font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="rounded-lg border border-black/15 px-5 py-3 font-medium transition-opacity hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { customer, isAuthenticated, isLoading, updateCustomer, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !customer) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-gray-600">Loading your account...</p>
      </main>
    );
  }

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <main className="flex-1">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wider">Account</p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight">Your profile</h1>

          <p className="mt-4 max-w-2xl text-gray-600">Manage your Caffeinawa account information.</p>
        </div>

        <AccountForm key={customer.id} customer={customer} updateCustomer={updateCustomer} />

        <div className="mt-8 flex flex-col gap-4 border-t border-black/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/menu" className="text-sm font-medium underline underline-offset-4">
            Browse the menu
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="text-left text-sm font-medium text-red-600 underline underline-offset-4 transition-opacity hover:opacity-60 sm:text-right"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

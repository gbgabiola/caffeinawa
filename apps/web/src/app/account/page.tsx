'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';

import type { LoginCustomer, UpdateCustomerInput } from '@/lib/api/auth';

import { useAuth } from '@/components/auth/AuthProvider';
import FormField from '@/components/ui/FormField';

type FormSubmitHandler = NonNullable<ComponentProps<'form'>['onSubmit']>;

interface ProfileDraft {
  name: string;
  email: string;
}

interface AccountFormProps {
  customer: LoginCustomer;
  updateCustomer: (input: UpdateCustomerInput) => Promise<void>;
}

const inputClassName =
  'mt-2 min-h-12 w-full rounded-xl border border-cafe-border bg-white px-4 py-3 text-base text-cafe-espresso read-only:bg-cafe-cream read-only:text-cafe-muted disabled:opacity-60';

function AccountForm({ customer, updateCustomer }: AccountFormProps) {
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const editing = draft !== null;

  const values = draft ?? {
    name: customer.name,
    email: customer.email,
  };

  const hasChanges =
    draft !== null && (draft.name.trim() !== customer.name.trim() || draft.email.trim() !== customer.email.trim());

  function startEditing() {
    setDraft({
      name: customer.name,
      email: customer.email,
    });

    setMessage('');
    setError('');
  }

  function cancelEditing() {
    setDraft(null);
    setMessage('');
    setError('');
  }

  const handleSubmit: FormSubmitHandler = async event => {
    event.preventDefault();

    if (!draft || !hasChanges || isSaving) return;

    const name = draft.name.trim();
    const email = draft.email.trim();

    if (!name) {
      setError('Please enter your name.');
      return;
    }

    setMessage('');
    setError('');
    setIsSaving(true);

    try {
      await updateCustomer({ name, email });

      setDraft(null);
      setMessage('Your profile has been updated.');
    } catch {
      setError('Unable to update your profile. Check your information and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="profile-heading"
      className="rounded-2xl border border-cafe-border bg-cafe-paper p-5 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="profile-heading" className="font-display text-2xl">
            Profile details
          </h2>

          <p className="mt-2 text-sm leading-6 text-cafe-muted">Keep your name and email address up to date.</p>
        </div>

        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="min-h-11 rounded-full border border-cafe-border px-5 text-sm font-semibold hover:bg-cafe-soft"
          >
            Edit profile
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} aria-busy={isSaving} className="mt-7 space-y-5">
        <FormField htmlFor="name" label="Name">
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            readOnly={!editing}
            disabled={isSaving}
            value={values.name}
            onChange={event => {
              const name = event.target.value;

              setDraft(current => (current ? { ...current, name } : current));
            }}
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
            readOnly={!editing}
            disabled={isSaving}
            value={values.email}
            onChange={event => {
              const email = event.target.value;

              setDraft(current => (current ? { ...current, email } : current));
            }}
            className={inputClassName}
          />
        </FormField>

        {editing && (
          <p className="text-xs leading-6 text-cafe-muted">
            If you change your email address, use the new address the next time you sign in.
          </p>
        )}

        {message && (
          <p
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-800"
          >
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
          >
            {error}
          </p>
        )}

        {editing && (
          <div className="flex flex-col gap-3 border-t border-cafe-border pt-5 sm:flex-row">
            <button
              type="submit"
              disabled={isSaving || !hasChanges}
              className="min-h-12 rounded-full bg-cafe-espresso px-6 text-sm font-semibold text-white hover:bg-cafe-brown disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>

            <button
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
              className="min-h-12 rounded-full border border-cafe-border px-6 text-sm font-semibold hover:bg-cafe-soft disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

export default function AccountPage() {
  const router = useRouter();

  const { customer, isAuthenticated, isLoading, updateCustomer, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login?next=%2Faccount');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated || !customer) {
    return (
      <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16">
        <p role="status" className="text-sm text-cafe-muted">
          {isLoading ? 'Loading your account...' : 'Taking you to sign in...'}
        </p>
      </main>
    );
  }

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  const nameParts = customer.name.trim().split(/\s+/);

  const initials =
    (
      (nameParts[0]?.[0] ?? '') + (nameParts.length > 1 ? (nameParts[nameParts.length - 1]?.[0] ?? '') : '')
    ).toUpperCase() || 'C';

  return (
    <main className="flex-1 bg-cafe-cream text-cafe-espresso">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">Your little corner</p>

        <h1 className="mt-3 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Make yourself at home.</h1>

        <p className="mt-4 text-sm leading-7 text-cafe-muted">
          Manage your details and get back to your next coffee moment.
        </p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside aria-label="Account overview" className="rounded-2xl border border-cafe-border bg-cafe-paper p-6">
            <div
              aria-hidden="true"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-cafe-soft font-display text-2xl text-cafe-brown"
            >
              {initials}
            </div>

            <p className="mt-5 break-words font-display text-2xl">{customer.name}</p>

            <p className="mt-2 break-all text-sm leading-6 text-cafe-muted">{customer.email}</p>

            <span className="mt-4 inline-flex rounded-full bg-cafe-soft px-3 py-1.5 text-xs font-medium text-cafe-brown">
              {customer.role === 'ADMIN' ? 'Administrator' : 'Customer'}
            </span>

            <nav aria-label="Account shortcuts" className="mt-6 space-y-2 border-t border-cafe-border pt-5">
              <Link
                href="/menu"
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium hover:bg-cafe-cream"
              >
                Explore the menu
                <span aria-hidden="true">↗</span>
              </Link>

              <Link
                href="/cart"
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium hover:bg-cafe-cream"
              >
                View your cart
                <span aria-hidden="true">↗</span>
              </Link>

              <Link
                href="/orders"
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium hover:bg-cafe-cream"
              >
                View your orders
                <span aria-hidden="true">↗</span>
              </Link>

              {customer.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium hover:bg-cafe-cream"
                >
                  Admin dashboard
                  <span aria-hidden="true">↗</span>
                </Link>
              )}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 min-h-11 w-full rounded-full border border-cafe-border px-5 text-sm font-medium text-cafe-muted hover:bg-cafe-soft hover:text-cafe-espresso"
            >
              Sign out
            </button>
          </aside>

          <AccountForm key={customer.id} customer={customer} updateCustomer={updateCustomer} />
        </div>
      </div>
    </main>
  );
}

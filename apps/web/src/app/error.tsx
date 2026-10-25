'use client';

import Link from 'next/link';

interface ErrorPageProps {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16 text-cafe-espresso">
      <section
        aria-labelledby="error-heading"
        className="w-full max-w-xl rounded-3xl border border-cafe-border bg-cafe-paper px-6 py-12 text-center sm:px-10"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">A moment to reconnect</p>

        <div
          aria-hidden="true"
          className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-cafe-soft font-display text-3xl text-cafe-brown"
        >
          !
        </div>

        <h1 id="error-heading" className="mt-7 font-display text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
          Something went wrong.
        </h1>

        <p role="alert" className="mx-auto mt-5 max-w-sm text-sm leading-7 text-cafe-muted">
          We couldn&apos;t display this page. Try again, or head back to the menu.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-cafe-espresso px-6 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Try again
          </button>

          <Link
            href="/menu"
            className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-cafe-border px-6 text-sm font-semibold hover:bg-cafe-soft"
          >
            Back to the menu
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16 text-cafe-espresso">
      <section
        aria-labelledby="not-found-heading"
        className="w-full max-w-xl rounded-3xl border border-cafe-border bg-cafe-paper px-6 py-12 text-center sm:px-10"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">404 · Page not found</p>

        <div
          aria-hidden="true"
          className="mx-auto mt-7 flex h-20 w-20 items-center justify-center rounded-full bg-cafe-soft text-cafe-brown"
        >
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12">
            <path d="M14 25h29v13a14.5 14.5 0 0 1-29 0V25Z" strokeLinejoin="round" />
            <path
              d="M43 28h5a7 7 0 0 1 0 14h-6M10 54h39M23 10c-5 5 5 6 0 11M34 8c-5 5 5 7 0 12"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1 id="not-found-heading" className="mt-7 font-display text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
          This page isn&apos;t on the menu.
        </h1>

        <p className="mx-auto mt-5 max-w-sm text-sm leading-7 text-cafe-muted">
          The link may be outdated, or the address might be incorrect. Let&apos;s get you somewhere familiar.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/menu"
            className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-cafe-espresso px-6 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Explore the menu
          </Link>

          <Link
            href="/"
            className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-cafe-border px-6 text-sm font-semibold hover:bg-cafe-soft"
          >
            Go to homepage
          </Link>
        </div>
      </section>
    </main>
  );
}

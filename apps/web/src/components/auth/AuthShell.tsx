import type { ReactNode } from 'react';
import Link from 'next/link';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export default function AuthShell({ eyebrow, title, description, children }: AuthShellProps) {
  return (
    <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-10 text-cafe-espresso sm:px-8 sm:py-16">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-cafe-border bg-cafe-paper lg:grid-cols-[0.9fr_1fr]">
        <aside className="hidden flex-col justify-between bg-cafe-espresso p-10 text-cafe-cream lg:flex">
          <Link href="/" className="w-fit font-display text-3xl font-bold tracking-[-0.06em]">
            Caffeinawa
          </Link>

          <div className="py-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cafe-cream/75">
              A familiar favorite
            </p>

            <p className="mt-6 font-display text-5xl leading-tight tracking-[-0.04em]">
              Good coffee.
              <br />
              Better moments.
            </p>

            <p className="mt-6 max-w-xs text-sm leading-7 text-cafe-cream/80">
              Your next coffee moment is a little closer.
            </p>
          </div>

          <Link
            href="/menu"
            className="inline-flex min-h-11 w-fit items-center gap-3 text-sm font-medium underline underline-offset-8"
          >
            Explore the menu
            <span aria-hidden="true">↗</span>
          </Link>
        </aside>

        <section className="px-6 py-8 sm:px-10 sm:py-10">
          <Link
            href="/menu"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-cafe-muted hover:text-cafe-espresso"
          >
            <span aria-hidden="true">←</span>
            Back to the menu
          </Link>

          <header className="mb-7 mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">{eyebrow}</p>

            <h1 className="mt-4 font-display text-4xl tracking-[-0.04em]">{title}</h1>

            <p className="mt-4 text-sm leading-7 text-cafe-muted">{description}</p>
          </header>

          {children}
        </section>
      </div>
    </main>
  );
}

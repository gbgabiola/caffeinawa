import Image from 'next/image';
import Link from 'next/link';

const orderingSteps = [
  {
    number: '01',
    title: 'Find your favorite',
    description: 'Explore the menu and find the coffee that fits your mood.',
  },
  {
    number: '02',
    title: 'Make it your order',
    description: 'Sign in, add your drinks, and review everything in your cart.',
  },
  {
    number: '03',
    title: 'Enjoy the moment',
    description: 'Complete checkout and keep your order details close at hand.',
  },
];

export default function HomePage() {
  return (
    <main className="flex-1 bg-cafe-cream text-cafe-espresso">
      <section aria-labelledby="home-heading" className="relative isolate overflow-hidden border-b border-cafe-border">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/images/menu-hero.png"
            alt=""
            fill
            unoptimized
            loading="eager"
            sizes="100vw"
            className="object-cover object-[68%_center] md:object-center"
          />

          <div className="absolute inset-0 bg-linear-to-r from-cafe-cream via-cafe-cream/95 to-cafe-cream/30 md:via-cafe-cream/70 md:to-transparent" />
        </div>

        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cafe-accent">
              Welcome to Caffeinawa
            </p>

            <h1
              id="home-heading"
              className="mt-6 font-display text-[clamp(3rem,6.2vw,5.75rem)] leading-[1.02] tracking-[-0.055em]"
            >
              Good coffee.
              <br />
              Better moments.
            </h1>

            <p className="mt-6 max-w-md text-base leading-8 text-cafe-brown">
              A little pause. A familiar favorite. Something new to look forward to. Find your next coffee moment with
              Caffeinawa.
            </p>

            <div className="mt-8 flex flex-col gap-3 min-[400px]:flex-row">
              <Link
                href="/menu"
                className="inline-flex min-h-12 items-center justify-center gap-4 rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white transition-colors hover:bg-cafe-brown"
              >
                Explore the menu
                <span aria-hidden="true">↗</span>
              </Link>

              <a
                href="#how-to-order"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-cafe-brown/30 bg-cafe-paper/70 px-6 text-sm font-semibold text-cafe-espresso transition-colors hover:bg-cafe-paper"
              >
                How to order
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="coffee-moment-heading"
        className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-[1fr_1fr] md:items-center md:gap-16"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">
            Your daily kind of good
          </p>

          <h2
            id="coffee-moment-heading"
            className="mt-4 max-w-lg font-display text-3xl leading-tight tracking-[-0.04em] sm:text-4xl"
          >
            Whatever your mood,
            <br />
            make room for coffee.
          </h2>
        </div>

        <div>
          <p className="max-w-lg text-base leading-8 text-cafe-muted">
            Bold espresso, a smooth latte, or something chilled. Browse by category, discover a new favorite, and build
            an order that feels like you.
          </p>

          <Link
            href="/menu"
            className="mt-4 inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-cafe-accent underline underline-offset-8"
          >
            Find your favorite
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section
        id="how-to-order"
        aria-labelledby="ordering-heading"
        className="scroll-mt-6 border-y border-cafe-border bg-cafe-paper"
      >
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">Keep it simple</p>

            <h2 id="ordering-heading" className="mt-4 font-display text-3xl tracking-[-0.04em] sm:text-4xl">
              Your next order, in three steps.
            </h2>
          </div>

          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {orderingSteps.map(step => (
              <li key={step.number} className="rounded-2xl border border-cafe-border bg-cafe-cream p-6 sm:p-7">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-cafe-border bg-cafe-paper text-xs font-semibold tabular-nums text-cafe-accent"
                >
                  {step.number}
                </span>

                <h3 className="mt-6 font-display text-2xl tracking-[-0.03em]">{step.title}</h3>

                <p className="mt-3 text-sm leading-7 text-cafe-muted">{step.description}</p>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-sm leading-6 text-cafe-muted">
            Already have an account?{' '}
            <Link
              href="/login"
              className="inline-block py-2 font-semibold text-cafe-accent underline underline-offset-4"
            >
              Sign in
            </Link>{' '}
            when you&apos;re ready to order.
          </p>
        </div>
      </section>

      <section aria-labelledby="menu-invitation-heading" className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-7 rounded-3xl bg-cafe-espresso px-6 py-10 text-cafe-cream sm:px-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-cream/75">
              A moment worth making
            </p>

            <h2
              id="menu-invitation-heading"
              className="mt-4 font-display text-3xl leading-tight tracking-[-0.04em] sm:text-4xl"
            >
              Your favorite might be
              <br />
              one sip away.
            </h2>
          </div>

          <Link
            href="/menu"
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-4 rounded-full bg-cafe-cream px-7 text-sm font-semibold text-cafe-espresso transition-colors hover:bg-cafe-soft sm:w-fit"
          >
            Browse the menu
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="border-t border-cafe-border bg-cafe-cream text-cafe-espresso">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          <div>
            <Link href="/" className="inline-flex min-h-11 items-center rounded-sm">
              <Image
                src="/images/caffeinawa-logo.webp"
                alt="Caffeinawa"
                width={960}
                height={960}
                unoptimized
                className="brand-logo h-40 w-40 object-contain"
              />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6 text-cafe-muted">
              Handcrafted coffee for your everyday moments.
            </p>
          </div>

          <address className="text-sm not-italic md:justify-self-end">
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="h-5 w-5 shrink-0 text-cafe-accent"
                >
                  <path
                    d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span>Pampanga, Philippines</span>
              </li>
              <li>
                <a
                  href="mailto:caffeinawa@gmail.com"
                  className="inline-flex min-h-11 items-center gap-3 underline-offset-4 hover:underline"
                >
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="h-5 w-5 shrink-0 text-cafe-accent"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 6 9 7 9-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="break-all">caffeinawa@gmail.com</span>
                </a>
              </li>
              <li>
                <a
                  href="tel:+639175478881"
                  className="inline-flex min-h-11 items-center gap-3 underline-offset-4 hover:underline"
                >
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="h-5 w-5 shrink-0 text-cafe-accent"
                  >
                    <path
                      d="m8 3 3 5-3 2a14 14 0 0 0 6 6l2-3 5 3-1 4c-.2.7-.8 1-1.5 1C9.9 20.5 3.5 14.1 3 5.5 3 4.8 3.3 4.2 4 4l4-1Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>+63 917 547 8881</span>
                </a>
              </li>
            </ul>
          </address>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-cafe-border pt-5 text-xs text-cafe-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2024–2026 Caffeinawa. All rights reserved.</p>
          <a
            href="https://www.facebook.com/caffeinawa"
            aria-label="Caffeinawa on Facebook"
            className="inline-flex h-11 w-11 items-center justify-center self-start rounded-full text-cafe-accent transition-colors hover:bg-cafe-soft hover:text-cafe-espresso sm:self-auto"
          >
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
              <path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2-2h2V1.4A24 24 0 0 0 15 1c-3 0-5 1.8-5 5v3H7v4h3v8h4Z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}

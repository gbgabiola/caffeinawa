import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-black/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Caffeinawa
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-6 text-sm font-medium">
            <li>
              <Link href="/" className="transition-opacity hover:opacity-60">
                Home
              </Link>
            </li>

            <li>
              <Link href="/menu" className="transition-opacity hover:opacity-60">
                Menu
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

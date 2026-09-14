import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto max-w-7xl px-6 py-24">
        <p className="text-sm font-medium uppercase tracking-wider">Caffeinawa</p>

        <h1 className="mt-4 max-w-3xl text-5xl font-bold tracking-tight">
          Good coffee. Good conversations. Good moments.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          Welcome to Caffeinawa — a coffee experience built around great coffee and even better moments.
        </p>

        <div className="mt-8">
          <Link href="/menu" className="inline-flex rounded-lg bg-black px-5 py-3 font-medium text-white">
            Explore our menu
          </Link>
        </div>
      </section>
    </main>
  );
}

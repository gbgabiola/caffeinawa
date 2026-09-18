import { CoffeeGrid } from '@/components/coffee/CoffeeGrid';
import { getMenu } from '@/lib/api/menu';

export default async function MenuPage() {
  const coffees = await getMenu();

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wider">Caffeinawa</p>

        <h1 className="mt-2 text-4xl font-bold">Our Coffee</h1>

        <p className="mt-3 max-w-2xl text-gray-600">
          Discover handcrafted coffee made for every kind of coffee moment.
        </p>
      </header>

      <CoffeeGrid coffees={coffees} />
    </main>
  );
}

import { getCoffees } from '@/lib/api/coffees';

export default async function MenuPage() {
  const coffees = await getCoffees();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-4xl font-bold">Caffeinawa Coffee Menu</h1>

      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {coffees.map(coffee => (
          <article key={coffee.id} className="rounded-xl border p-6">
            <h2 className="text-xl font-semibold">{coffee.name}</h2>

            <p className="mt-2 text-gray-600">{coffee.description}</p>

            <p className="mt-4 font-bold">₱{coffee.price}</p>
          </article>
        ))}
      </div>
    </main>
  );
}

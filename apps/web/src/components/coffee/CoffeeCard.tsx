import type { Coffee } from '@caffeinawa/types';

interface CoffeeCardProps {
  coffee: Coffee;
}

export function CoffeeCard({ coffee }: CoffeeCardProps) {
  return (
    <article className="rounded-xl border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{coffee.name}</h2>

          <p className="mt-2 text-sm text-gray-600">{coffee.description}</p>
        </div>

        <span className="font-semibold">₱{coffee.price}</span>
      </div>

      <div className="mt-4">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm">{coffee.category}</span>
      </div>

      <p className="mt-4 text-sm">{coffee.available ? 'Available' : 'Unavailable'}</p>
    </article>
  );
}

import type { Coffee } from '@caffeinawa/types';

import { CoffeeCard } from './CoffeeCard';

interface CoffeeGridProps {
  coffees: Coffee[];
}

export function CoffeeGrid({ coffees }: CoffeeGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {coffees.map(coffee => (
        <CoffeeCard key={coffee.id} coffee={coffee} />
      ))}
    </div>
  );
}

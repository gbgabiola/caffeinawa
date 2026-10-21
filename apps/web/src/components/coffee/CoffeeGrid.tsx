import { CoffeeCard } from './CoffeeCard';

import type { Coffee } from '@caffeinawa/types';

interface CoffeeGridProps {
  coffees: Coffee[];
}

export function CoffeeGrid({ coffees }: CoffeeGridProps) {
  return (
    <div className="grid items-stretch gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
      {coffees.map(coffee => (
        <CoffeeCard key={coffee.id} coffee={coffee} />
      ))}
    </div>
  );
}

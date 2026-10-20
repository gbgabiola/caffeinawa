import type { Coffee } from '@caffeinawa/types';

import { CoffeeCard } from './CoffeeCard';

interface CoffeeGridProps {
  coffees: Coffee[];
}

export function CoffeeGrid({ coffees }: CoffeeGridProps) {
  return (
    <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
      {coffees.map(coffee => (
        <CoffeeCard key={coffee.id} coffee={coffee} />
      ))}
    </div>
  );
}

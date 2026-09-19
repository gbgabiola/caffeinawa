import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main(): Promise<void> {
  await prisma.coffee.createMany({
    data: [
      {
        name: 'Caffeinawa Espresso',
        description: 'Rich and bold espresso with a smooth finish.',
        category: 'espresso',
        price: 120,
        available: true,
      },
      {
        name: 'Caffeinawa Latte',
        description: 'Smooth espresso blended with steamed milk.',
        category: 'latte',
        price: 150,
        available: true,
      },
      {
        name: 'Caffeinawa Cold Brew',
        description: 'Slow-brewed coffee served chilled.',
        category: 'cold_brew',
        price: 160,
        available: true,
      },
    ],
  });

  console.log('Coffee seed completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

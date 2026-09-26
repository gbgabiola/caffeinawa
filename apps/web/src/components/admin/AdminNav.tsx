'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/coffees', label: 'Coffee' },
] as const;

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 border-b border-gray-200 bg-white lg:min-h-[calc(100vh-65px)] lg:w-64 lg:border-b-0 lg:border-r">
      <div className="p-4 lg:sticky lg:top-0">
        <div className="mb-4 px-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Administration</p>
        </div>

        <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto lg:flex-col">
          {navigation.map(item => {
            const isActive = item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

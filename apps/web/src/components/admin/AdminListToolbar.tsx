import type { ReactNode } from 'react';
interface AdminListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  children?: ReactNode;
}

export default function AdminListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  children,
}: AdminListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-cafe-border bg-cafe-cream p-4 sm:flex-row sm:items-end sm:justify-between">
      <label className="block min-w-0 flex-1 sm:max-w-md">
        <span className="text-xs font-semibold uppercase tracking-wide text-cafe-muted">Search</span>
        <input
          type="search"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="mt-1 w-full rounded-lg border border-cafe-input-border bg-cafe-paper px-3 py-2 text-sm text-cafe-espresso shadow-sm outline-none focus:border-cafe-accent focus:ring-2 focus:ring-cafe-accent/25"
        />
      </label>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

import type { ReactNode } from 'react';

interface AdminTableProps {
  children: ReactNode;
  className?: string;
}

export default function AdminTable({ children, className = 'w-full text-left text-sm' }: AdminTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={className}>{children}</table>
    </div>
  );
}

interface AdminTableHeadProps {
  children: ReactNode;
  className?: string;
}

export function AdminTableHead({ children, className = 'border-b border-cafe-border bg-cafe-cream' }: AdminTableHeadProps) {
  return <thead className={className}>{children}</thead>;
}

interface AdminTableBodyProps {
  children: ReactNode;
  className?: string;
}

export function AdminTableBody({ children, className = 'divide-y divide-cafe-border' }: AdminTableBodyProps) {
  return <tbody className={className}>{children}</tbody>;
}

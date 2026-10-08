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

export function AdminTableHead({ children, className = 'border-b border-gray-200 bg-gray-50' }: AdminTableHeadProps) {
  return <thead className={className}>{children}</thead>;
}

interface AdminTableBodyProps {
  children: ReactNode;
  className?: string;
}

export function AdminTableBody({ children, className = 'divide-y divide-gray-100' }: AdminTableBodyProps) {
  return <tbody className={className}>{children}</tbody>;
}

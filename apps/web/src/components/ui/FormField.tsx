import type { ReactNode } from 'react';

interface FormFieldProps {
  htmlFor: string;
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
}

export default function FormField({ htmlFor, label, description, error, children }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
        {label}
      </label>

      {description && (
        <p id={`${htmlFor}-description`} className="mt-1 text-xs text-gray-500">
          {description}
        </p>
      )}

      {children}

      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

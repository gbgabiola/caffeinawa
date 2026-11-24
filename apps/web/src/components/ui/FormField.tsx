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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-cafe-brown">
        {label}
      </label>

      {description && (
        <p id={`${htmlFor}-description`} className="mt-1 text-xs text-cafe-muted">
          {description}
        </p>
      )}

      {children}

      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}

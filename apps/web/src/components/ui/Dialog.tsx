'use client';

import { useEffect, useId, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  closeDisabled?: boolean;
}

export default function Dialog({ open, onClose, title, description, children, closeDisabled = false }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || closeDisabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDisabled, onClose, open]);

  if (!open) {
    return null;
  }

  function handleOverlayClick() {
    if (!closeDisabled) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={event => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          {title}
        </h2>

        {description && (
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-600">
            {description}
          </p>
        )}

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

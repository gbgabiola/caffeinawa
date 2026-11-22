'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { COFFEE_IMAGE_MAX_BYTES, COFFEE_IMAGE_TYPES } from '@caffeinawa/types';
import FormField from '@/components/ui/FormField';

interface Props {
  file: File | null;
  imageUrl: string;
  disabled: boolean;
  onSelect: (file: File | null) => void;
}

export default function CoffeePhotoPicker({ file, imageUrl, disabled, onSelect }: Props) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string>();
  const objectUrl = useRef('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  function select(next: File | null) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = '';
    setPreview('');
    setError(undefined);
    if (
      next &&
      (!COFFEE_IMAGE_TYPES.some((type) => type === next.type) || next.size === 0 || next.size > COFFEE_IMAGE_MAX_BYTES)
    ) {
      setError('Choose a JPEG, PNG or WebP photo, 3 MB or smaller.');
      onSelect(null);
      if (input.current) input.current.value = '';
      return;
    }
    if (next) {
      objectUrl.current = URL.createObjectURL(next);
      setPreview(objectUrl.current);
    } else if (input.current) input.current.value = '';
    onSelect(next);
  }

  let source = file ? preview : '';
  if (!file && imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (['http:', 'https:'].includes(url.protocol)) source = url.href;
    } catch {
      /* A partially typed URL is not a previewable image yet. */
    }
  }
  return (
    <div className="md:col-span-2">
      <FormField
        htmlFor="coffee-photo"
        label="Attach photo"
        description="JPEG, PNG or WebP. Maximum 3 MB and 8 megapixels. A selected file takes precedence over the image URL."
        error={error}
      >
        <input
          ref={input}
          id="coffee-photo"
          type="file"
          accept={COFFEE_IMAGE_TYPES.join(',')}
          disabled={disabled}
          aria-describedby={error ? 'coffee-photo-description coffee-photo-error' : 'coffee-photo-description'}
          aria-invalid={Boolean(error)}
          className="mt-2 block w-full text-sm"
          onChange={(event) => select(event.target.files?.[0] ?? null)}
        />
      </FormField>
      {file && (
        <button type="button" disabled={disabled} onClick={() => select(null)} className="mt-2 text-sm underline">
          Remove selected photo
        </button>
      )}
      {source && (
        <Image
          src={source}
          alt="Coffee photo preview"
          width={320}
          height={240}
          unoptimized
          className="mt-3 h-40 w-52 rounded-lg object-cover"
        />
      )}
    </div>
  );
}

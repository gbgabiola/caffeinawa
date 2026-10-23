import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FormField from './FormField';

describe('FormField accessibility', () => {
  it('associates the visible label with the input', () => {
    render(
      <FormField htmlFor="customer-name" label="Name">
        <input id="customer-name" type="text" />
      </FormField>,
    );

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('id', 'customer-name');
  });

  it('provides an accessible description through its stable ID', () => {
    render(
      <FormField htmlFor="password" label="Password" description="Use between 8 and 128 characters.">
        <input id="password" type="password" aria-describedby="password-description" />
      </FormField>,
    );

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Use between 8 and 128 characters.');
  });

  it('exposes an associated validation error', () => {
    render(
      <FormField htmlFor="email" label="Email address" error="Enter a valid email address.">
        <input id="email" type="email" aria-invalid="true" aria-describedby="email-error" />
      </FormField>,
    );

    const input = screen.getByRole('textbox', {
      name: 'Email address',
    });

    expect(input).toHaveAttribute('aria-invalid', 'true');

    expect(input).toHaveAccessibleDescription('Enter a valid email address.');

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
  });
});

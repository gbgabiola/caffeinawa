import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from './error';
import NotFoundPage from './not-found';

describe('Route recovery interfaces', () => {
  it('provides working destinations on the not-found page', () => {
    render(<NotFoundPage />);

    expect(
      screen.getByRole('heading', {
        name: "This page isn't on the menu.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('link', {
        name: 'Explore the menu',
      }),
    ).toHaveAttribute('href', '/menu');

    expect(
      screen.getByRole('link', {
        name: 'Go to homepage',
      }),
    ).toHaveAttribute('href', '/');
  });

  it('invokes the route reset callback when retry is selected', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<ErrorPage error={new Error('Rendering failed')} reset={reset} />);

    await user.click(
      screen.getByRole('button', {
        name: 'Try again',
      }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows recovery guidance without exposing internal errors', () => {
    const error = Object.assign(new Error('Internal database connection details'), { digest: 'internal-reference' });

    render(<ErrorPage error={error} reset={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't display this page.");

    expect(screen.queryByText(/Internal database connection details/)).not.toBeInTheDocument();

    expect(screen.queryByText(/internal-reference/)).not.toBeInTheDocument();

    expect(
      screen.getByRole('link', {
        name: 'Back to the menu',
      }),
    ).toHaveAttribute('href', '/menu');
  });
});

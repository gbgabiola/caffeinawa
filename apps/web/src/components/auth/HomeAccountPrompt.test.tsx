import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomeAccountPrompt from './HomeAccountPrompt';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: mocks.useAuth,
}));

describe('HomeAccountPrompt', () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
  });

  it('shows the sign-in prompt to signed-out visitors', () => {
    mocks.useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    });

    render(<HomeAccountPrompt />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('hides the prompt for authenticated customers', () => {
    mocks.useAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });

    const { container } = render(<HomeAccountPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it('hides the prompt while authentication is loading', () => {
    mocks.useAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });

    const { container } = render(<HomeAccountPrompt />);

    expect(container).toBeEmptyDOMElement();
  });
});

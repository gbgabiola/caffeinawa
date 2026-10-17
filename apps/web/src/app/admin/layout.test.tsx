import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminLayout from './layout';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  usePathname: () => '/admin/payments/reconciliation',
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/components/admin/AdminNav', () => ({
  default: () => <nav>Admin navigation</nav>,
}));

vi.mock('@/components/providers/QueryProvider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('AdminLayout authorization', () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({
      customer: null,
      isLoading: false,
    });
  });

  it('shows a loading state while authentication resolves', () => {
    mocks.useAuth.mockReturnValue({
      customer: null,
      isLoading: true,
    });

    render(
      <AdminLayout>
        <div>Protected reconciliation page</div>
      </AdminLayout>,
    );

    expect(screen.getByText('Checking admin access...')).toBeInTheDocument();

    expect(screen.queryByText('Protected reconciliation page')).not.toBeInTheDocument();

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated users to login', async () => {
    render(
      <AdminLayout>
        <div>Protected reconciliation page</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login');
    });

    expect(screen.queryByText('Protected reconciliation page')).not.toBeInTheDocument();
  });

  it('redirects non-admin customers', async () => {
    mocks.useAuth.mockReturnValue({
      customer: {
        id: 'customer-1',
        role: 'CUSTOMER',
      },
      isLoading: false,
    });

    render(
      <AdminLayout>
        <div>Protected reconciliation page</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/');
    });

    expect(screen.queryByText('Protected reconciliation page')).not.toBeInTheDocument();
  });

  it('renders admin content for administrators', () => {
    mocks.useAuth.mockReturnValue({
      customer: {
        id: 'admin-1',
        role: 'ADMIN',
      },
      isLoading: false,
    });

    render(
      <AdminLayout>
        <div>Protected reconciliation page</div>
      </AdminLayout>,
    );

    expect(screen.getByText('Protected reconciliation page')).toBeInTheDocument();

    expect(screen.getByText('Admin navigation')).toBeInTheDocument();

    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

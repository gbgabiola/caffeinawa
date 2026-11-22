import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminCoffeesPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  status: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => ({ accessToken: 'admin-token' }) }));
vi.mock('@/lib/api/admin-coffees', () => ({
  getAdminCoffees: mocks.get,
  createAdminCoffee: mocks.create,
  updateAdminCoffee: mocks.update,
  deleteAdminCoffee: mocks.remove,
  getCoffeeImageUploadStatus: mocks.status,
  uploadAdminCoffeeImage: mocks.upload,
}));
const coffee = {
  id: 'coffee-1',
  name: 'Latte',
  description: 'Espresso and milk',
  category: 'latte',
  price: 120,
  available: true,
};
const createObjectURL = vi.fn(() => 'blob:photo-preview');
const revokeObjectURL = vi.fn();

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminCoffeesPage />
    </QueryClientProvider>,
  );
}
async function fill() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add Coffee' }));
  await user.type(screen.getByLabelText('Name'), 'Latte');
  await user.type(screen.getByLabelText('Description'), 'Espresso and milk');
  await user.type(screen.getByLabelText('Price'), '120');
  return user;
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  createObjectURL.mockReturnValue('blob:photo-preview');
  mocks.get.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 } });
  mocks.create.mockResolvedValue(coffee);
  mocks.update.mockResolvedValue(coffee);
  mocks.status.mockResolvedValue({ enabled: true });
  mocks.upload.mockResolvedValue({ imageUrl: 'https://res.cloudinary.com/photo.webp' });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Admin coffee photo attachment', () => {
  it('previews a file and uploads it only after coffee creation', async () => {
    show();
    const user = await fill();
    const file = new File(['photo'], 'latte.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Attach photo'), file);
    expect(screen.getByAltText('Coffee photo preview')).toHaveAttribute('src', 'blob:photo-preview');
    expect(screen.getByLabelText('Image URL')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Create Coffee' }));
    await screen.findByText('Coffee created successfully.');
    expect(mocks.upload).toHaveBeenCalledWith('admin-token', coffee.id, file);
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-preview');
  });
  it('keeps the committed coffee ID on photo failure and retries without duplicate creation', async () => {
    mocks.upload.mockRejectedValueOnce(new Error('Provider unavailable'));
    show();
    const user = await fill();
    await user.upload(screen.getByLabelText('Attach photo'), new File(['photo'], 'latte.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Create Coffee' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Coffee saved, but photo upload failed.');
    expect(screen.getByAltText('Coffee photo preview')).toHaveAttribute('src', 'blob:photo-preview');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await screen.findByText('Coffee updated successfully.');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith('admin-token', coffee.id, expect.any(Object));
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });
  it('does not create a coffee if photo uploads are disabled', async () => {
    mocks.status.mockResolvedValue({ enabled: false });
    show();
    const user = await fill();
    await user.upload(screen.getByLabelText('Attach photo'), new File(['photo'], 'latte.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Create Coffee' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Photo uploads are not configured');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('preserves URL-only creation without checking upload configuration', async () => {
    show();
    const user = await fill();
    await user.type(screen.getByLabelText('Image URL'), 'https://example.test/latte.jpg');
    await user.click(screen.getByRole('button', { name: 'Create Coffee' }));
    await screen.findByText('Coffee created successfully.');
    expect(mocks.create).toHaveBeenCalledWith(
      'admin-token',
      expect.objectContaining({ imageUrl: 'https://example.test/latte.jpg' }),
    );
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects oversized attachments and permits removing a selection', async () => {
    show();
    const user = await fill();
    await user.upload(
      screen.getByLabelText('Attach photo'),
      new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('3 MB or smaller');
    expect(createObjectURL).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText('Attach photo'), new File(['photo'], 'small.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Remove selected photo' }));
    await waitFor(() => expect(screen.queryByAltText('Coffee photo preview')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Image URL')).toBeEnabled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-preview');
  });
});

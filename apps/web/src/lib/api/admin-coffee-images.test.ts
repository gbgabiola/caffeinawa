import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCoffeeImageUploadStatus, uploadAdminCoffeeImage } from './admin-coffees';

afterEach(() => vi.unstubAllGlobals());
describe('Coffee photo transport', () => {
  it('sends raw bytes with authorization and an image content type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ imageUrl: 'https://res.cloudinary.com/photo.webp' })));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['photo'], 'latte.png', { type: 'image/png' });
    await uploadAdminCoffeeImage('admin-token', 'coffee/id', file);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/coffee-images/coffee%2Fid'),
      expect.objectContaining({
        method: 'POST',
        body: file,
        cache: 'no-store',
        headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'image/png' },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('surfaces upload errors without retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: 'Photo upload failed.' }), { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      uploadAdminCoffeeImage('admin-token', 'id', new File(['photo'], 'latte.png', { type: 'image/png' })),
    ).rejects.toThrow('Photo upload failed.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('checks configuration through an authenticated endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: false })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getCoffeeImageUploadStatus('admin-token')).resolves.toEqual({ enabled: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/coffee-images/status'),
      expect.objectContaining({ headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' } }),
    );
  });
});

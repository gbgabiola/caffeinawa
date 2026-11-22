import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { CoffeeImageService } from './coffee-image.service.js';

const id = 'd15c0ffe-0000-4000-8000-000000000001';
describe('Coffee image uploads', () => {
  const prisma = { coffee: { findUnique: vi.fn(), updateMany: vi.fn() } };
  const fetchMock = vi.fn();
  const service = new CoffeeImageService(prisma as unknown as PrismaService);
  let png: Buffer;
  let override: Record<string, unknown>;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv('COFFEE_IMAGE_UPLOAD_ENABLED', 'true');
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
    vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret');
    vi.stubGlobal('fetch', fetchMock);
    prisma.coffee.findUnique.mockResolvedValue({
      id,
      imageUrl: 'https://example.test/old.jpg',
      imagePublicId: null,
    });
    prisma.coffee.updateMany.mockResolvedValue({ count: 1 });
    png = await sharp({
      create: { width: 20, height: 10, channels: 3, background: 'brown' },
    })
      .png()
      .toBuffer();
    override = {};
    fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
      const form = options.body as FormData;
      const publicId = form.get('public_id');
      return new Response(
        JSON.stringify({
          public_id: publicId,
          version: 123,
          type: 'upload',
          resource_type: 'image',
          format: 'webp',
          secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v123/${publicId}.webp`,
          ...override,
        }),
      );
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('re-encodes images, signs one upload and atomically attaches server-owned metadata', async () => {
    const result = await service.attach(id, png);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudinary.com/v1_1/test-cloud/image/upload');
    expect(options.redirect).toBe('error');
    const form = options.body as FormData;
    expect(form.get('overwrite')).toBe('false');
    expect(form.get('signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(form.get('public_id')).toMatch(
      new RegExp(`^caffeinawa/coffees/${id}/`),
    );
    const file = form.get('file') as File;
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.orientation).toBeUndefined();
    expect(prisma.coffee.updateMany).toHaveBeenCalledWith({
      where: {
        id,
        imageUrl: 'https://example.test/old.jpg',
        imagePublicId: null,
      },
      data: { imageUrl: result.imageUrl, imagePublicId: form.get('public_id') },
    });
  });

  it('accepts a 1920 by 2880 JPEG and resizes its longest edge to 1600 pixels', async () => {
    const jpeg = await sharp({
      create: { width: 1920, height: 2880, channels: 3, background: 'brown' },
    })
      .jpeg()
      .toBuffer();
    await service.attach(id, jpeg);
    const form = fetchMock.mock.calls[0][1].body as FormData;
    const file = form.get('file') as File;
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.height).toBe(1600);
    expect(meta.width).toBeLessThanOrEqual(1600);
  });

  it('does not upload or write when disabled', async () => {
    vi.stubEnv('COFFEE_IMAGE_UPLOAD_ENABLED', 'false');
    await expect(service.attach(id, png)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.coffee.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails closed for missing provider configuration', async () => {
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    expect(service.isEnabled()).toBe(false);
    await expect(service.attach(id, png)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
  it.each([
    Buffer.alloc(0),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.from('not an image'),
    Buffer.alloc(3 * 1024 * 1024 + 1),
    'not bytes',
  ])(
    'rejects empty, unsupported, corrupt or oversized input',
    async (bytes) => {
      await expect(service.attach(id, bytes)).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.coffee.updateMany).not.toHaveBeenCalled();
    },
  );
  it('rejects a decompression-sized image beyond the pixel limit', async () => {
    const large = await sharp({
      create: { width: 3000, height: 3000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(service.attach(id, large)).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('checks coffee existence before contacting the provider', async () => {
    prisma.coffee.findUnique.mockResolvedValue(null);
    await expect(service.attach(id, png)).rejects.toThrow(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not overwrite a concurrently edited photo', async () => {
    prisma.coffee.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.attach(id, png)).rejects.toThrow(ConflictException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { public_id: 'another-asset' },
    { resource_type: 'video' },
    { type: 'private' },
    { format: 'svg' },
    { version: 0 },
    { secure_url: 'http://res.cloudinary.com/unsafe' },
    { secure_url: 'https://untrusted.example/photo.webp' },
  ])(
    'rejects malformed provider responses without a database write: %j',
    async (value) => {
      override = value;
      await expect(service.attach(id, png)).rejects.toThrow(
        BadGatewayException,
      );
      expect(prisma.coffee.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['network', 'http', 'invalid-json', 'oversized-body'])(
    'returns a safe error without retrying on %s failure',
    async (kind) => {
      fetchMock.mockImplementationOnce(async () => {
        if (kind === 'network') throw new Error('private provider credentials');
        if (kind === 'http')
          return new Response('private provider credentials', { status: 400 });
        if (kind === 'invalid-json')
          return new Response('private provider credentials');
        return new Response('x'.repeat(65537));
      });
      try {
        await service.attach(id, png);
        throw new Error('expected upload failure');
      } catch (error) {
        expect(error).toBeInstanceOf(BadGatewayException);
        expect(String(error)).not.toContain('private provider credentials');
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(prisma.coffee.updateMany).not.toHaveBeenCalled();
    },
  );
});

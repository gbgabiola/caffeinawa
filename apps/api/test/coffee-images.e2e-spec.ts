import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { CoffeeImageService } from '../src/coffee/coffee-image.service.js';
import { CoffeeService } from '../src/coffee/coffee.service.js';
import { assertTestDatabaseEnvironment } from './database-environment.js';

describe('Coffee image persistence (isolated database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let images: CoffeeImageService;
  let coffees: CoffeeService;
  let id: string;
  let png: Buffer;
  let duringUpload: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    assertTestDatabaseEnvironment();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    images = app.get(CoffeeImageService);
    coffees = app.get(CoffeeService);
    png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'brown' },
    })
      .png()
      .toBuffer();
  });
  beforeEach(async () => {
    vi.stubEnv('COFFEE_IMAGE_UPLOAD_ENABLED', 'true');
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
    vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret');
    duringUpload = undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        if (duringUpload) await duringUpload();
        const publicId = (options.body as FormData).get('public_id');
        return new Response(
          JSON.stringify({
            public_id: publicId,
            version: 123,
            type: 'upload',
            resource_type: 'image',
            format: 'webp',
            secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v123/${publicId}.webp`,
          }),
        );
      }),
    );
    const coffee = await prisma.coffee.create({
      data: {
        name: 'Image test coffee',
        description: 'Isolated fixture',
        category: 'latte',
        price: 120,
      },
    });
    id = coffee.id;
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (id) await prisma.coffee.delete({ where: { id } });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('persists managed metadata, preserves it on detail edits and clears it for an external URL', async () => {
    const uploaded = await images.attach(id, png);
    let row = await prisma.coffee.findUniqueOrThrow({ where: { id } });
    expect(row.imageUrl).toBe(uploaded.imageUrl);
    expect(row.imagePublicId).toMatch(new RegExp(`^caffeinawa/coffees/${id}/`));
    const metadata = row.imagePublicId;
    const publicCoffee = await coffees.update(id, {
      name: 'Updated coffee',
      imageUrl: uploaded.imageUrl,
    });
    expect(publicCoffee).not.toHaveProperty('imagePublicId');
    row = await prisma.coffee.findUniqueOrThrow({ where: { id } });
    expect(row.imagePublicId).toBe(metadata);
    await coffees.update(id, { imageUrl: 'https://example.test/external.jpg' });
    row = await prisma.coffee.findUniqueOrThrow({ where: { id } });
    expect(row.imagePublicId).toBeNull();
    expect(row.imageUrl).toBe('https://example.test/external.jpg');
  });

  it('rejects attachment if another photo change commits during the provider request', async () => {
    duringUpload = async () => {
      await coffees.update(id, { imageUrl: 'https://example.test/winner.jpg' });
    };
    await expect(images.attach(id, png)).rejects.toMatchObject({ status: 409 });
    const row = await prisma.coffee.findUniqueOrThrow({ where: { id } });
    expect(row.imageUrl).toBe('https://example.test/winner.jpg');
    expect(row.imagePublicId).toBeNull();
  });
});

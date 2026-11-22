import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { COFFEE_IMAGE_MAX_BYTES } from '@caffeinawa/types';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class CoffeeImageService {
  private readonly logger = new Logger(CoffeeImageService.name);
  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return (
      process.env.COFFEE_IMAGE_UPLOAD_ENABLED === 'true' &&
      /^[a-z0-9_-]+$/.test(process.env.CLOUDINARY_CLOUD_NAME ?? '') &&
      !!process.env.CLOUDINARY_API_KEY?.trim() &&
      !!process.env.CLOUDINARY_API_SECRET?.trim()
    );
  }

  async attach(
    coffeeId: string,
    bytes: unknown,
  ): Promise<{ imageUrl: string }> {
    if (!this.isEnabled())
      throw new ServiceUnavailableException(
        'Photo uploads are not configured. You can still use an image URL.',
      );
    if (!Buffer.isBuffer(bytes) || bytes.length === 0)
      throw new BadRequestException('Choose a photo.');
    if (bytes.length > COFFEE_IMAGE_MAX_BYTES)
      throw new BadRequestException('Photo must be 3 MB or smaller.');
    const coffee = await this.prisma.coffee.findUnique({
      where: { id: coffeeId },
    });
    if (!coffee) throw new NotFoundException('Coffee not found.');

    let image: Buffer;
    let stage = 'metadata';
    try {
      const input = sharp(bytes, {
        limitInputPixels: 8_000_000,
        failOn: 'warning',
      });
      const meta = await input.metadata();
      if (
        !meta.format ||
        !['jpeg', 'png', 'webp'].includes(meta.format) ||
        (meta.pages ?? 1) !== 1
      )
        throw new Error('Unsupported image format or animation');
      stage = 'conversion';
      image = await input
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (error: unknown) {
      // Decoder errors contain no provider credentials. Keep diagnostics bounded
      // and server-side so deployment failures can be distinguished from bad files.
      const reason =
        error instanceof Error
          ? error.message.replace(/[\r\n]/g, ' ').slice(0, 240)
          : 'Unknown decoder error';
      this.logger.warn({ event: 'coffee_image_decode_failed', stage, reason });
      throw new BadRequestException(
        'Use a valid, non-animated JPEG, PNG or WebP photo up to 8 megapixels.',
      );
    }

    const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
    const publicId = `caffeinawa/coffees/${coffeeId}/${randomUUID()}`;
    const params: Record<string, string> = {
      overwrite: 'false',
      public_id: publicId,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const signature = createHash('sha256')
      .update(
        Object.keys(params)
          .sort()
          .map((key) => `${key}=${params[key]}`)
          .join('&') + process.env.CLOUDINARY_API_SECRET!,
      )
      .digest('hex');
    const body = new FormData();
    for (const [key, value] of Object.entries(params)) body.set(key, value);
    body.set('api_key', process.env.CLOUDINARY_API_KEY!);
    body.set('signature', signature);
    body.set(
      'file',
      new Blob([new Uint8Array(image)], { type: 'image/webp' }),
      'coffee.webp',
    );

    let imageUrl: string;
    try {
      // One attempt only. A timeout can leave an unattached provider asset.
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
        {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(15_000),
          redirect: 'error',
        },
      );
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 64 * 1024) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      const result: unknown = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      );
      if (!result || typeof result !== 'object') throw new Error();
      const data = result as Record<string, unknown>;
      if (
        data.public_id !== publicId ||
        data.resource_type !== 'image' ||
        data.type !== 'upload' ||
        data.format !== 'webp' ||
        typeof data.secure_url !== 'string' ||
        !Number.isSafeInteger(data.version) ||
        Number(data.version) <= 0
      )
        throw new Error();
      const expected = `https://res.cloudinary.com/${cloud}/image/upload/v${data.version}/${publicId}.webp`;
      if (data.secure_url !== expected) throw new Error();
      imageUrl = expected;
    } catch {
      throw new BadGatewayException(
        'Photo upload failed. The current photo was kept. Check Cloudinary before retrying an uncertain upload.',
      );
    }

    // Do not overwrite an image changed by another administrator during upload.
    const updated = await this.prisma.coffee.updateMany({
      where: {
        id: coffeeId,
        imageUrl: coffee.imageUrl,
        imagePublicId: coffee.imagePublicId,
      },
      data: { imageUrl, imagePublicId: publicId },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        'Coffee photo changed during upload. Refresh before uploading again.',
      );
    return { imageUrl };
  }
}

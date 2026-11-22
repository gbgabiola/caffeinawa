import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { COFFEE_IMAGE_MAX_BYTES, COFFEE_IMAGE_TYPES } from '@caffeinawa/types';
import express, { type Request, type Response } from 'express';

@Injectable()
export class CoffeeImageBodyInterceptor implements NestInterceptor {
  private readonly parse = express.raw({
    type: () => true,
    limit: COFFEE_IMAGE_MAX_BYTES,
    inflate: false,
  });

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const type = request.headers['content-type']
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (
      !COFFEE_IMAGE_TYPES.some((allowed) => allowed === type) ||
      (request.headers['content-encoding'] &&
        request.headers['content-encoding'] !== 'identity')
    ) {
      throw new UnsupportedMediaTypeException('Use a JPEG, PNG or WebP photo.');
    }
    await new Promise<void>((resolve, reject) => {
      this.parse(request, response, (error?: { type?: string }) => {
        if (error?.type === 'entity.too.large')
          reject(
            new PayloadTooLargeException('Photo must be 3 MB or smaller.'),
          );
        else if (error)
          reject(new BadRequestException('Unable to read photo.'));
        else resolve();
      });
    });
    return next.handle();
  }
}

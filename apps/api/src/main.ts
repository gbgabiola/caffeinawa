import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { validateEnvironment } from './config/environment.js';

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: new URL(process.env.WEB_URL!).origin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);

  console.log(`Caffeinawa API listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'API startup failed');

  process.exitCode = 1;
});

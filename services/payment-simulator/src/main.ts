import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Graceful shutdown: on SIGTERM (docker stop, a Kubernetes rollout) Nest stops accepting
  // connections and finishes the requests in progress before the process exits.
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);

  new Logger('Bootstrap').log(
    `Payment simulator listening on port ${config.port}, webhooks go to ${config.webhookUrl}`,
  );
}

void bootstrap();

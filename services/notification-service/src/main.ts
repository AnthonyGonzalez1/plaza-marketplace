import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Graceful shutdown: on SIGTERM (docker stop, a Kubernetes rollout) Nest calls the shutdown
  // hooks of the providers. The consumer stops taking messages and lets the ones in progress
  // finish; then the Redis and SMTP connections are closed and the process exits.
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);

  new Logger('Bootstrap').log(
    `Notification service listening on port ${config.port} (GET /health), ` +
      `emails go to ${config.smtpHost}:${config.smtpPort}`,
  );
}

void bootstrap();

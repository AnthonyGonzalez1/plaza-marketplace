import { Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './config';
import { OrderEventsConsumer } from './events/order-events.consumer';
import { HealthController } from './health.controller';
import { Mailer } from './notifications/mailer';
import { NotificationService } from './notifications/notification.service';
import { SentEventsStore } from './notifications/sent-events.store';

// The service is small enough for a single module. Its only HTTP endpoint is /health: the
// real input is the RabbitMQ queue, read by OrderEventsConsumer.
@Module({
  controllers: [HealthController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    OrderEventsConsumer,
    NotificationService,
    Mailer,
    SentEventsStore,
  ],
})
export class AppModule {}

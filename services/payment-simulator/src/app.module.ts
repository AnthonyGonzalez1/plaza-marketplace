import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { APP_CONFIG, loadConfig } from './config';
import { HealthController } from './health.controller';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { ProblemDetailsFilter } from './problem-details.filter';
import { WebhookSender } from './webhooks/webhook-sender';

// The service is small enough for a single module: two controllers and the classes they use.
@Module({
  controllers: [HealthController, PaymentsController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    PaymentsService,
    WebhookSender,
    // Registered here (not in main.ts) so the tests, which build the app from this module,
    // get the same validation and the same error format as the real service.
    // whitelist: properties that are not declared in the DTO are dropped.
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true }) },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}

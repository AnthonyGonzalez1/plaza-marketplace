import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OrderEventsConsumer } from './events/order-events.consumer';

// Used by Docker and Kubernetes to know that the service can do its job. For a worker that
// means more than "the process answers HTTP": without a connection to RabbitMQ no event
// arrives and no email goes out, so that case is reported as 503 DOWN.
@Controller('health')
export class HealthController {
  constructor(private readonly consumer: OrderEventsConsumer) {}

  @Get()
  health(@Res({ passthrough: true }) response: Response): { status: 'UP' | 'DOWN' } {
    if (!this.consumer.isConnected()) {
      // passthrough: only the status code is set by hand; Nest still writes the returned
      // object as the JSON body.
      response.status(503);
      return { status: 'DOWN' };
    }
    return { status: 'UP' };
  }
}

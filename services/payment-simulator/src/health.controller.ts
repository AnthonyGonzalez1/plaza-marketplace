import { Controller, Get } from '@nestjs/common';

// Used by Docker and Kubernetes to know that the process is up and answering.
@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'UP' } {
    return { status: 'UP' };
  }
}

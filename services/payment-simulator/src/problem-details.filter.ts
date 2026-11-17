import { STATUS_CODES } from 'node:http';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';

// Turns every HTTP error (400 invalid body, 404 unknown route...) into the "problem details"
// JSON of RFC 9457, the same error format that store-api uses:
//   {"status":400,"title":"Bad Request","detail":"orderId must be a UUID"}
@Catch(HttpException)
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();

    response
      .status(status)
      .type('application/problem+json')
      .json({
        status,
        title: STATUS_CODES[status] ?? 'Error',
        detail: describe(exception),
      });
  }
}

// The ValidationPipe puts one message per broken rule in "message" (an array); other Nest
// errors carry a single string.
function describe(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body.message;
    if (Array.isArray(message)) {
      return message.join('; ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return exception.message;
}

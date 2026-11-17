import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { createClient } from 'redis';
import { APP_CONFIG, type AppConfig } from '../config';
import { describeError } from '../describe-error';

// How long Redis remembers that an event was handled. A duplicate normally arrives seconds or
// minutes after the original; a week is far more than enough, and the expiry keeps Redis from
// growing forever.
const CLAIM_TTL_SECONDS = 7 * 24 * 60 * 60;

// Remembers, in Redis, which events already produced an email. A thin wrapper: the rest of the
// code only knows claim() and release(), and the tests replace this class with a fake.
@Injectable()
export class SentEventsStore implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SentEventsStore.name);
  private readonly client;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createClient({
      url: config.redisUrl,
      // While Redis is unreachable, a command fails at once instead of waiting in a queue
      // inside the client. The failure makes the message go to the retry queue, where waiting
      // is visible and limited.
      disableOfflineQueue: true,
    });
    // The client reconnects by itself and reports every failed try here. Without a listener,
    // Node treats an "error" event as an uncaught exception and stops the process.
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis: ${describeError(error)}`);
    });
    this.client.on('ready', () => this.logger.log('Connected to Redis'));
  }

  onModuleInit(): void {
    // Not awaited: connect() only finishes when Redis answers, and the service must be able to
    // start before Redis does (in compose and Kubernetes the start order is not guaranteed).
    void this.client.connect().catch(() => {
      // Only rejects when the client is closed while still trying to connect (shutdown).
    });
  }

  // "I am going to handle this event." Returns true for the first caller and false for
  // everyone after it.
  //
  // SET ... NX means "set only if the key does Not eXist". Redis runs it as a single step, so
  // when two copies of the same event are processed at the same time only one of them gets
  // true. Doing it in two steps (GET to look, then SET) would let both copies see "not there".
  async claim(eventId: string): Promise<boolean> {
    const result = await this.client.set(key(eventId), '1', { NX: true, EX: CLAIM_TTL_SECONDS });
    // 'OK' = the key was created now. null = it already existed.
    return result === 'OK';
  }

  // Undoes a claim, so the event can be handled again later.
  async release(eventId: string): Promise<void> {
    await this.client.del(key(eventId));
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}

function key(eventId: string): string {
  return `notification:sent:${eventId}`;
}

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type Channel, type ChannelModel, connect, type ConsumeMessage } from 'amqplib';
import { APP_CONFIG, type AppConfig } from '../config';
import { describeError } from '../describe-error';
import { NotificationService } from '../notifications/notification.service';
import { parseOrderEvent } from './order-event';

// --- Names shared with the publisher (store-api) -------------------------------------------
//
// A publisher never writes to a queue. It publishes to an EXCHANGE with a routing key
// ("order.paid"), and the exchange copies the message into every QUEUE whose binding matches
// that key. The publisher does not know who is listening: another service can get the same
// events later by binding its own queue, without touching store-api.
export const EXCHANGE = 'plaza.events';
// "order.*" matches order.placed, order.paid and order.cancelled ("*" = exactly one word).
export const BINDING_KEY = 'order.*';

// --- Queues that belong to this service ----------------------------------------------------
export const QUEUE = 'notifications.order-events';
// Where a failed message waits before its next attempt. Nobody consumes from it.
export const RETRY_QUEUE = 'notifications.order-events.retry';
// Dead-letter queue: where a message is parked when the service gives up on it.
export const DEAD_LETTER_QUEUE = 'notifications.order-events.dlq';

// Header written by this service: which attempt a delivery is. A message that comes straight
// from the publisher has no such header and counts as attempt 1.
export const ATTEMPT_HEADER = 'x-attempt';

// How many unacknowledged messages RabbitMQ gives this consumer at a time. It is the limit of
// messages processed in parallel: a burst of events stays in the queue, not in memory.
const PREFETCH = 5;
// Wait between two attempts to connect to RabbitMQ.
const RECONNECT_DELAY_MS = 3000;
// On shutdown, how long to wait for the messages that are being processed.
const SHUTDOWN_WAIT_MS = 10_000;

// The two channel operations that handleMessage needs. The real amqplib channel has them, and
// a test can pass an object with two fake functions.
export type MessageChannel = Pick<Channel, 'ack' | 'sendToQueue'>;

@Injectable()
export class OrderEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventsConsumer.name);

  private connection?: ChannelModel;
  private channel?: Channel;
  private consumerTag?: string;
  private connected = false;
  private stopping = false;
  // Messages received and not finished yet (see onModuleDestroy).
  private inFlight = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    // Not awaited: the loop runs for the whole life of the process, in the background. The
    // HTTP server starts at once and /health tells whether RabbitMQ is connected.
    void this.run();
  }

  // Used by GET /health.
  isConnected(): boolean {
    return this.connected;
  }

  // The connection loop: connect, consume until the connection is lost, wait, start again.
  // The same loop covers "RabbitMQ is not up yet when the service starts" (normal in compose
  // and Kubernetes, where the start order is not guaranteed) and "RabbitMQ restarted".
  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.consumeUntilDisconnected();
        if (!this.stopping) {
          this.logger.warn('Connection to RabbitMQ lost');
        }
      } catch (error) {
        this.logger.warn(`Cannot consume from RabbitMQ: ${describeError(error)}`);
      }
      this.connected = false;

      if (!this.stopping) {
        this.logger.log(`Connecting to RabbitMQ again in ${RECONNECT_DELAY_MS} ms`);
        await sleep(RECONNECT_DELAY_MS);
      }
    }
  }

  // Opens a connection, declares the queues and consumes. Returns when the connection closes;
  // throws when the connection or the set-up fails.
  private async consumeUntilDisconnected(): Promise<void> {
    const connection = await connect(this.config.rabbitmqUrl);
    const closed = new Promise<void>((resolve) => connection.once('close', () => resolve()));
    // An "error" event without a listener stops the Node process. Logging is enough: after
    // an error the connection always emits "close", which is what the loop waits for.
    connection.on('error', (error) => {
      this.logger.warn(`RabbitMQ connection error: ${describeError(error)}`);
    });

    try {
      // A channel is a lightweight "session" inside the single TCP connection. Every AMQP
      // command (declare, consume, publish, ack) travels through a channel.
      const channel = await connection.createChannel();
      channel.on('error', (error) => {
        this.logger.warn(`RabbitMQ channel error: ${describeError(error)}`);
      });
      // RabbitMQ closes only the channel after some errors (for example when a queue is
      // declared with different arguments than the existing one). The service cannot work
      // without its channel, so the connection is closed too and the loop starts from zero.
      channel.once('close', () => {
        void connection.close().catch(() => undefined);
      });

      await this.declareTopology(channel);
      await channel.prefetch(PREFETCH);

      // Manual acknowledgements (noAck: false): RabbitMQ keeps every delivered message until
      // this service answers "ack". If the process dies in the middle, the message was not
      // acked and RabbitMQ delivers it again to the next consumer. Nothing is lost; the price
      // is that a message can arrive twice (at-least-once delivery).
      const consumer = await channel.consume(
        QUEUE,
        (message) => {
          // null means that RabbitMQ cancelled the consumer (for example the queue was
          // deleted). Closing the channel makes the loop declare everything again.
          if (message === null) {
            void channel.close().catch(() => undefined);
            return;
          }
          void this.onMessage(channel, message);
        },
        { noAck: false },
      );

      this.connection = connection;
      this.channel = channel;
      this.consumerTag = consumer.consumerTag;
      this.connected = true;
      this.logger.log(`Connected to RabbitMQ, consuming from "${QUEUE}"`);
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }

    await closed;
    this.connection = undefined;
    this.channel = undefined;
    this.consumerTag = undefined;
  }

  // Declares the exchange and the three queues. Declaring is idempotent: if they already
  // exist with the same settings nothing happens, so it is safe on every start (and the
  // publisher declares the exchange too, whoever starts first creates it).
  // "durable" = the exchange or queue survives a restart of RabbitMQ.
  private async declareTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    await channel.assertQueue(QUEUE, { durable: true });
    await channel.bindQueue(QUEUE, EXCHANGE, BINDING_KEY);

    // The "wait queue" pattern for delayed retries. RabbitMQ cannot deliver a message "in 5
    // seconds", but a queue can expire its messages: a message published here stays for
    // RETRY_DELAY_MS (nobody consumes it), expires, and an expired message is "dead-lettered":
    // RabbitMQ republishes it to the configured exchange and routing key. The exchange '' is
    // the default exchange, which delivers to the queue named like the routing key, so the
    // message comes back to the main queue.
    // Note: these arguments are fixed when the queue is created. After changing
    // RETRY_DELAY_MS the old retry queue must be deleted, or this declaration fails.
    await channel.assertQueue(RETRY_QUEUE, {
      durable: true,
      messageTtl: this.config.retryDelayMs,
      deadLetterExchange: '',
      deadLetterRoutingKey: QUEUE,
    });

    // A plain queue without consumer: messages stay until a person looks at them.
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  }

  private async onMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
    this.inFlight++;
    try {
      await this.handleMessage(channel, message);
    } catch (error) {
      // Reaching this point means that even the ack or the publish failed, which happens
      // when the connection dropped meanwhile. Nothing to do: the message was not acked, so
      // RabbitMQ delivers it again after the reconnection.
      this.logger.warn(
        `Message left unacknowledged, it will be redelivered: ${describeError(error)}`,
      );
    } finally {
      this.inFlight--;
    }
  }

  // Everything that happens to one message. Every path ends in exactly one ack: the message
  // leaves the main queue because it was handled, or because a copy of it was published to
  // the retry queue or to the dead-letter queue.
  //
  // Public and with the channel as a parameter so the tests can call it with a fake channel.
  async handleMessage(channel: MessageChannel, message: ConsumeMessage): Promise<void> {
    const attempt = readAttempt(message);

    const parsed = parseOrderEvent(message.content.toString('utf8'));
    if (!parsed.ok) {
      // A message that is not a valid event will be just as invalid on the next attempt:
      // retrying cannot fix it. It goes straight to the dead-letter queue.
      const eventId = message.properties.messageId ?? 'unknown';
      const type = message.properties.type ?? 'unknown';
      this.logger.error(
        `Invalid message sent to the dead-letter queue: eventId=${eventId} type=${type} ` +
          `attempt=${attempt} error=${parsed.error}`,
      );
      this.publishCopy(channel, DEAD_LETTER_QUEUE, message, attempt, parsed.error);
      channel.ack(message);
      return;
    }

    const event = parsed.event;
    const line = `eventId=${event.eventId} type=${event.type} attempt=${attempt}/${this.config.maxAttempts}`;

    try {
      const result = await this.notifications.handle(event);
      if (result === 'sent') {
        this.logger.log(`Email sent: ${line}`);
      } else if (result === 'duplicate') {
        this.logger.log(`Duplicate event skipped, its email was already sent: ${line}`);
      } else {
        this.logger.debug(`Event ignored, no email for this type: ${line}`);
      }
    } catch (error) {
      // A failure that may go away by itself: the mail server or Redis is down.
      const reason = describeError(error);
      if (attempt < this.config.maxAttempts) {
        this.logger.warn(
          `Processing failed, retrying in ${this.config.retryDelayMs} ms: ${line} error=${reason}`,
        );
        this.publishCopy(channel, RETRY_QUEUE, message, attempt + 1, reason);
      } else {
        this.logger.error(
          `Processing failed on the last attempt, message sent to the dead-letter queue: ` +
            `${line} error=${reason}`,
        );
        this.publishCopy(channel, DEAD_LETTER_QUEUE, message, attempt, reason);
      }
    }

    channel.ack(message);
  }

  // Publishes a copy of the message (same body, same properties) to one of this service's
  // queues, with the attempt number and the last error in its headers.
  //
  // Why "publish a copy + ack" and not "nack with requeue": a requeued message comes back
  // immediately and cannot carry a counter, so a message that always fails would spin in a
  // tight loop forever. The copy can wait in the retry queue and count its attempts.
  //
  // The copy and the ack of the original travel in order through the same channel. If the
  // connection drops between them, the original is not acked and is delivered again: an
  // attempt may be repeated, but the message is not lost.
  private publishCopy(
    channel: MessageChannel,
    queue: string,
    message: ConsumeMessage,
    attempt: number,
    error: string,
  ): void {
    // sendToQueue publishes to the default exchange with the queue name as routing key.
    channel.sendToQueue(queue, message.content, {
      // Written to disk, so the copy survives a restart of RabbitMQ (like the original).
      persistent: true,
      contentType: message.properties.contentType,
      messageId: message.properties.messageId,
      type: message.properties.type,
      headers: {
        ...message.properties.headers,
        [ATTEMPT_HEADER]: attempt,
        'x-last-error': error,
        'x-failed-at': new Date().toISOString(),
        // The original routing key (order.paid...), useful to republish from the DLQ by hand.
        'x-original-routing-key':
          message.properties.headers?.['x-original-routing-key'] ?? message.fields.routingKey,
      },
    });
  }

  // Graceful shutdown (SIGTERM from "docker stop" or a Kubernetes rollout). onModuleDestroy
  // is the first shutdown hook Nest calls, so this runs while Redis and the mail transport
  // are still open and the messages in progress can finish.
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    const { connection, channel, consumerTag } = this;
    if (connection === undefined || channel === undefined || consumerTag === undefined) {
      return;
    }

    try {
      // 1. Tell RabbitMQ to stop delivering new messages to this consumer.
      await channel.cancel(consumerTag);

      // 2. Let the messages that are being processed finish and be acked.
      const deadline = Date.now() + SHUTDOWN_WAIT_MS;
      while (this.inFlight > 0 && Date.now() < deadline) {
        await sleep(50);
      }

      // 3. Close the connection (that closes its channel too). A message that is still
      //    unacked at this point is not lost: RabbitMQ delivers it again later.
      await connection.close();
    } catch (error) {
      this.logger.warn(`Error closing the RabbitMQ connection: ${describeError(error)}`);
    }
  }
}

// The attempt number of a delivery: the header written by publishCopy, or 1 without it.
function readAttempt(message: ConsumeMessage): number {
  const value: unknown = message.properties.headers?.[ATTEMPT_HEADER];
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

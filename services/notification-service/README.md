# Plaza notification service

A background worker that emails the customers of the shop when something happens to their
order. `store-api` publishes an event to RabbitMQ every time an order is paid or cancelled; this
service reads those events from its own queue and sends the matching email over SMTP. Nobody
calls it over HTTP: its only endpoint is `GET /health`.

| Event            | Email                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `OrderPaid`      | "Pago recibido: pedido 8d9e0f12": items, total, link to the order       |
| `OrderCancelled` | "Pedido cancelado: 8d9e0f12": why (payment declined / not paid in time) |
| `OrderPlaced`    | none yet: ignored on purpose (exercise S7)                              |
| anything else    | none: ignored                                                           |

Stack: NestJS 12, TypeScript, `amqplib` (RabbitMQ), `nodemailer` (SMTP), `redis` (node-redis),
Jest and supertest.

## Topology

```mermaid
flowchart LR
    store[store-api] -- "order.paid<br/>order.cancelled<br/>order.placed" --> ex{{"plaza.events<br/>(topic exchange)"}}
    ex -- "binding order.*" --> q[notifications.order-events]
    q --> svc[notification-service]
    svc -- "email" --> smtp[(SMTP / Mailpit)]
    svc -- "SET NX" --> redis[(Redis)]
    svc -- "failed, attempt < MAX" --> retry["notifications.order-events.retry<br/>(TTL = RETRY_DELAY_MS, no consumer)"]
    retry -- "expires: dead-lettered back" --> q
    svc -- "invalid, or last attempt failed" --> dlq[notifications.order-events.dlq]
```

- **Exchange vs queue.** `store-api` never writes to a queue: it publishes to the exchange
  `plaza.events` with a routing key such as `order.paid`. The exchange copies the message to
  every queue whose binding matches. This service owns the queue `notifications.order-events`,
  bound with `order.*`. Another service can receive the same events by binding its own queue,
  without any change in `store-api`.
- Everything is **durable** (survives a RabbitMQ restart) and declared by this service on start.
  Declaring is idempotent, so it is safe on every start; `store-api` declares the exchange too.

## Requirements

- Node.js 24 or newer
- pnpm 10 (`npm install --global pnpm@10`)
- RabbitMQ, Redis and an SMTP server. For development, Mailpit is a fake SMTP server that keeps
  every email and shows it in a web page; nothing is delivered to real inboxes.

## Scripts

Run them from this folder (`services/notification-service/`).

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `pnpm install`      | Installs the dependencies                          |
| `pnpm start:dev`    | Runs from the sources and restarts on every change |
| `pnpm build`        | Compiles TypeScript into `dist/`                   |
| `pnpm start`        | Runs the compiled service (`node dist/main.js`)    |
| `pnpm test`         | Runs the tests once (fast, no network)             |
| `pnpm lint`         | ESLint                                             |
| `pnpm typecheck`    | TypeScript without emitting files                  |
| `pnpm format`       | Formats every file with Prettier                   |
| `pnpm format:check` | Fails if a file is not formatted (used in CI)      |

`pnpm test` starts Jest with `node --experimental-vm-modules` because NestJS 12 is published as
ES modules and Jest needs that flag to load them. It is what the Nest starter project does.

## Configuration

Environment variables, all optional:

| Variable         | Default                                        | Meaning                                                  |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------- |
| `PORT`           | `3002`                                         | HTTP port (`GET /health`)                                |
| `RABBITMQ_URL`   | `amqp://plaza:plaza@localhost:5672`            | Where the events come from                               |
| `REDIS_URL`      | `redis://localhost:6379`                       | Where the service remembers which emails it already sent |
| `SMTP_HOST`      | `localhost`                                    | SMTP server                                              |
| `SMTP_PORT`      | `1025`                                         | SMTP port                                                |
| `MAIL_FROM`      | `Plaza Marketplace <no-reply@plaza.localhost>` | Sender of every email                                    |
| `WEB_BASE_URL`   | `http://localhost:3000`                        | Web shop address, for the link to the order              |
| `MAX_ATTEMPTS`   | `3`                                            | Attempts per message before the dead-letter queue        |
| `RETRY_DELAY_MS` | `5000`                                         | Wait before each retry                                   |

The SMTP connection has **no authentication and no TLS**: it is meant for Mailpit. A real mail
provider would need a user, a password and TLS (a change in `src/notifications/mailer.ts`).

A value that cannot be used (`PORT=abc`, `MAX_ATTEMPTS=0`, `RABBITMQ_URL=nonsense`) stops the
service at start-up with a message. The service reads real environment variables only; to use a
file, copy `.env.example` to `.env` and run `node --env-file=.env dist/main.js`.

## The events

```json
{
  "eventId": "0193a1e6-7c1d-7a3b-9f2e-4b5c6d7e8f90",
  "type": "OrderCancelled",
  "occurredAt": "2026-11-17T12:00:00Z",
  "order": {
    "id": "0193a1e5-2b3c-7d4e-8f5a-6b7c8d9e0f12",
    "email": "ana@example.com",
    "status": "CANCELLED",
    "total": 64000.0,
    "currency": "COP",
    "items": [
      {
        "productId": 1,
        "name": "Café molido Quindío 500 g",
        "unitPrice": 32000.0,
        "quantity": 2,
        "lineTotal": 64000.0
      }
    ]
  },
  "reason": "PAYMENT_DECLINED"
}
```

- Routing keys `order.placed`, `order.paid`, `order.cancelled`; persistent messages with
  `contentType: application/json`, the AMQP property `messageId` = `eventId` and `type` = the
  event type.
- `reason` comes only with `OrderCancelled`: `PAYMENT_DECLINED` or `EXPIRED`.
- Required fields: `eventId`, `type`, `occurredAt`, `order.id`, `order.email`, `order.total`,
  `order.items` (each with `name`, `unitPrice`, `quantity`, `lineTotal`). Extra fields are
  ignored.

## What happens to each message

The consumer uses **manual acknowledgements** with `prefetch` 5: RabbitMQ hands over at most
five messages at a time and keeps each one until the service answers "ack". If the process dies
before the ack, RabbitMQ delivers the message again. Nothing is lost, but a message can arrive
more than once: this is **at-least-once delivery**.

1. **Parse and validate.** A message that is not valid JSON or lacks a required field goes
   straight to the dead-letter queue and is acked: retrying cannot fix it.
2. **Choose the email** from `type`. A type without email (`OrderPlaced` for now) is logged at
   debug level and acked.
3. **Idempotency.** Before sending, the event is claimed in Redis:
   `SET notification:sent:<eventId> 1 NX EX 604800` (create only if it does not exist, expire
   after 7 days). If the key already existed, the email was sent before: ack and skip. If the
   email then fails, the key is deleted so the retry can send it. At-least-once delivery plus a
   consumer that ignores repeats gives "effectively once". The limits:
   - a crash after sending and before the ack is fine: the redelivered copy finds the key and is
     skipped;
   - if the SMTP server accepts the email but its answer is lost (timeout), the claim is
     released and the retry sends a second email;
   - a crash between the claim and the sending loses that email (the key blocks the retry);
   - if Redis is down, nothing is sent and the message is retried.
4. **Retries.** When sending fails (SMTP or Redis down), the service reads its own header
   `x-attempt` (missing = 1). If `x-attempt < MAX_ATTEMPTS`, a copy with `x-attempt + 1` is
   published to `notifications.order-events.retry` and the original is acked. The retry queue
   has no consumer and a message TTL of `RETRY_DELAY_MS`: when a copy expires, RabbitMQ
   "dead-letters" it back to the main queue (default exchange, routing key
   `notifications.order-events`). That is how RabbitMQ waits before a retry without a timer in
   the code. On the last attempt the copy goes to the dead-letter queue instead.
5. **Dead-letter queue.** `notifications.order-events.dlq` has no consumer either: messages
   wait there for a person. Each one keeps its body and properties and gets the headers
   `x-attempt`, `x-last-error`, `x-failed-at` and `x-original-routing-key`.

Why not `nack` with requeue? A requeued message comes back at once and cannot carry a counter,
so a message that always fails would loop forever. The copy + ack approach waits and counts.

Every decision is logged with `eventId`, `type` and the attempt number.

`RETRY_DELAY_MS` is stored in the retry queue when RabbitMQ creates it. To change it later,
delete the queue `notifications.order-events.retry` (management UI, "Delete") and restart the
service; otherwise the declaration fails because the arguments differ.

## Health and shutdown

- `GET /health`: `200 {"status":"UP"}` while connected to RabbitMQ, `503 {"status":"DOWN"}`
  otherwise. Without RabbitMQ no event arrives, so the worker cannot do its job.
- If RabbitMQ is not reachable at start, or the connection drops later, the service logs it and
  tries again every 3 seconds. Redis reconnects by itself; while it is down the messages are
  retried.
- On SIGTERM the consumer is cancelled (no new messages), the messages in progress finish (up
  to 10 seconds), and the connections are closed. A message still unacked at that point is
  delivered again later.

## Try it locally

Start RabbitMQ, Redis and Mailpit on their default ports:

```sh
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=plaza -e RABBITMQ_DEFAULT_PASS=plaza rabbitmq:4-management-alpine
docker run -d --name redis -p 6379:6379 redis:8-alpine
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Then:

```sh
pnpm install
pnpm build
pnpm start
curl -i http://localhost:3002/health
```

Publish a test event from the RabbitMQ management UI (http://localhost:15672, user and password
`plaza`): Exchanges, `plaza.events`, "Publish message", routing key `order.paid`, property
`content_type=application/json`, and the JSON above with `"type":"OrderPaid"` as payload.

### Where to look

- **The emails**: Mailpit, http://localhost:8025 (or its API:
  `curl http://localhost:8025/api/v1/messages`).
- **The dead-letter queue**: management UI, Queues, `notifications.order-events.dlq`, "Get
  messages" shows the body and the `x-last-error` header. With "Ack mode: Automatic ack" the
  messages are removed as they are read; "Nack message requeue true" leaves them there. To
  reprocess one, publish its body again to `plaza.events` with its original routing key.
- **The idempotency keys**: `redis-cli --scan --pattern 'notification:sent:*'`.

To watch the retries, stop Mailpit (`docker stop mailpit`) and publish an event: the log shows
attempt 1, 2 and 3, `RETRY_DELAY_MS` apart, and then the message lands in the dead-letter queue.

## Docker

```sh
docker build -t plaza-notification-service .
docker run --rm -p 3002:3002 \
  -e RABBITMQ_URL=amqp://plaza:plaza@host.docker.internal:5672 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e SMTP_HOST=host.docker.internal \
  plaza-notification-service
```

The image is a multi-stage build: the first stage compiles TypeScript and removes the
development dependencies, the second one contains only Node, `dist/` and the production
`node_modules`, and runs as a non-root user (uid 1000). None of the production dependencies is
a native module, so the build stage can run on the CPU of the build machine.

## Structure

```
src/
  main.ts                       entry point: creates the app, graceful shutdown, listens on PORT
  app.module.ts                 the only Nest module
  config.ts                     reads the environment variables once
  describe-error.ts             turns anything thrown into a short text for logs and headers
  health.controller.ts          GET /health (UP only while connected to RabbitMQ)
  events/
    order-event.ts              the event types and their hand-written validator
    order-events.consumer.ts    connection loop, topology, consume, ack / retry / dead-letter
  notifications/
    notification.service.ts     which email for which event, idempotency with Redis
    email-templates.ts          the emails as pure functions (event) -> { subject, text, html }
    mailer.ts                   thin nodemailer wrapper (SMTP)
    sent-events.store.ts        thin Redis wrapper: claim(eventId) / release(eventId)
```

Tests live next to the code as `*.spec.ts`.

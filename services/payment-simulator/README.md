# Plaza payment simulator

A fake payment gateway for local development and demos. It plays the role that a real provider
(a bank, a card processor) has in production: `store-api` asks it to charge an order, it answers
"received" at once and, a moment later, calls `store-api` back with the result in a **signed
webhook**. No money and no real provider are involved.

```
store-api                         payment-simulator
    |  POST /payments  ---------------->  |
    |  <----------  202 {"status":"PENDING"}
    |                                     |  (waits PAYMENT_DELAY_MS)
    |  <--  POST {WEBHOOK_URL}  APPROVED  |
    |  200  ----------------------------> |
```

Stack: NestJS 12 (Express), TypeScript, Jest and supertest. No database: payments are kept in
memory and lost on restart.

## Requirements

- Node.js 24 or newer
- pnpm 10 (`npm install --global pnpm@10`)

## Scripts

Run them from this folder (`services/payment-simulator/`).

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

| Variable                 | Default                                          | Meaning                                                                |
| ------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `PORT`                   | `3001`                                           | HTTP port                                                              |
| `WEBHOOK_URL`            | `http://localhost:8080/api/v1/webhooks/payments` | Where results are sent                                                 |
| `WEBHOOK_SECRET`         | `local-dev-webhook-secret`                       | Shared secret for the HMAC signature                                   |
| `PAYMENT_DELAY_MS`       | `2000`                                           | Wait between accepting a payment and sending its webhook               |
| `DEFAULT_OUTCOME`        | `APPROVED`                                       | `APPROVED` or `DECLINED` when the request does not ask for one         |
| `DUPLICATE_WEBHOOKS`     | `false`                                          | `true` delivers every webhook twice (shows the receiver is idempotent) |
| `WEBHOOK_MAX_ATTEMPTS`   | `3`                                              | Delivery attempts per webhook                                          |
| `WEBHOOK_RETRY_DELAY_MS` | `1000`                                           | Wait before the first retry; doubles on each further retry             |

A value that cannot be used (`PORT=abc`, `DEFAULT_OUTCOME=MAYBE`) stops the service at start-up
with a message. The service reads real environment variables only; to use a file, copy
`.env.example` to `.env` and run `node --env-file=.env dist/main.js`.

## Contract

### `GET /health`

`200 {"status":"UP"}`

### `POST /payments`

```json
{
  "orderId": "9a6f3c1e-7b2d-4e8f-b1a0-2c4d6e8f0a33",
  "amount": 37000.0,
  "currency": "COP",
  "simulateOutcome": "DECLINED"
}
```

- `orderId`: a UUID. `amount`: a positive JSON number. `currency`: three letters.
- `simulateOutcome` (optional): `APPROVED` or `DECLINED`. Without it, `DEFAULT_OUTCOME` decides.
- Unknown properties are ignored.

Answers:

- `202 {"paymentId":"<uuid>","status":"PENDING"}`: accepted, the result comes later in the
  webhook. The answer never waits for the webhook.
- `400` with content type `application/problem+json` (RFC 9457) when the body is invalid:
  `{"status":400,"title":"Bad Request","detail":"orderId must be a UUID"}`. Other errors (for
  example 404 for an unknown path) use the same format.

### The webhook

`PAYMENT_DELAY_MS` after the 202, the simulator sends:

```
POST {WEBHOOK_URL}
Content-Type: application/json
X-Plaza-Signature: sha256=<hex>

{"eventId":"<uuid>","paymentId":"<uuid>","orderId":"<uuid>","status":"APPROVED","amount":37000,"currency":"COP","occurredAt":"2026-11-16T20:00:02Z"}
```

- **Signature.** `<hex>` is the HMAC-SHA256 of the exact bytes of the body, keyed with
  `WEBHOOK_SECRET`, in lowercase hexadecimal. The receiver must compute the HMAC over the raw
  body it received (before parsing the JSON) and compare. A match proves that the sender knows
  the secret and that the body was not changed.
- **`eventId`** is unique per event and is the same on retries and duplicates: the receiver
  uses it to recognise an event it already processed.
- **`amount`** is the number that arrived in `POST /payments`, written the way JavaScript
  writes numbers: `37000.00` goes out as `37000`, `37000.50` as `37000.5`.
- **`occurredAt`** is UTC, ISO 8601, without milliseconds.

**Delivery is at-least-once.** A 2xx answer means delivered. Any other status, a network error
or no answer within 5 seconds is retried: `WEBHOOK_MAX_ATTEMPTS` attempts in total, waiting
`WEBHOOK_RETRY_DELAY_MS` before the first retry and twice the previous wait before each further
one (1 s, 2 s, ...). After the last attempt the failure is logged and the event is dropped. The
receiver can therefore get the same event more than once and must be idempotent;
`DUPLICATE_WEBHOOKS=true` forces a second identical delivery to demonstrate it.

Every attempt writes one log line with the `eventId`, the `orderId`, the attempt number and the
result.

## Try it with curl

```sh
pnpm install
pnpm build
pnpm start
```

In another terminal:

```sh
curl -i http://localhost:3001/health

curl -i -X POST http://localhost:3001/payments \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"9a6f3c1e-7b2d-4e8f-b1a0-2c4d6e8f0a33","amount":37000.00,"currency":"COP"}'

# A declined payment
curl -i -X POST http://localhost:3001/payments \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"9a6f3c1e-7b2d-4e8f-b1a0-2c4d6e8f0a33","amount":37000.00,"currency":"COP","simulateOutcome":"DECLINED"}'

# An invalid body: 400 application/problem+json
curl -i -X POST http://localhost:3001/payments \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"not-a-uuid","amount":-1}'
```

Two seconds after each accepted payment the log shows the webhook attempts. Without `store-api`
running on port 8080 they fail with a network error and are retried twice, which is a simple
way to watch the retries.

## Docker

```sh
docker build -t plaza-payment-simulator .
docker run --rm -p 3001:3001 \
  -e WEBHOOK_URL=http://host.docker.internal:8080/api/v1/webhooks/payments \
  plaza-payment-simulator
```

The image is a multi-stage build: the first stage compiles TypeScript and removes the
development dependencies, the second one contains only Node, `dist/` and the production
`node_modules`, and runs as a non-root user (uid 1000).

## Structure

```
src/
  main.ts                     entry point: creates the app, graceful shutdown, listens on PORT
  app.module.ts               the only Nest module: controllers, services, validation, errors
  config.ts                   reads the environment variables once
  health.controller.ts        GET /health
  problem-details.filter.ts   turns HTTP errors into RFC 9457 JSON
  payments/
    create-payment.dto.ts     body of POST /payments and its validation rules
    payments.controller.ts    POST /payments -> 202
    payments.service.ts       keeps the payment in memory and schedules its webhook
  webhooks/
    signature.ts              sign(body, secret) -> "sha256=<hex>"
    webhook-sender.ts         sends the webhook: sign, retry with backoff, duplicates
```

Tests live next to the code as `*.spec.ts`.

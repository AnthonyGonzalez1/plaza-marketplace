# Plaza end-to-end tests

Browser tests that use Plaza the way a buyer does: a real Chromium opens the web app, which
talks to the real API, database and payment simulator. They are written with
[Playwright Test](https://playwright.dev/).

## What the suite covers

| File                                | What it proves                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/purchase.spec.ts`            | Happy path: search, product page, add 2 units, cart, checkout, pay, and the order ends up **paid**. Also: a declined payment **cancels** the order. |
| `tests/stock.spec.ts`               | A declined payment returns the reserved unit to the stock (API calls only, no browser).                                                             |
| `tests/checkout-validation.spec.ts` | An invalid e-mail shows the validation message and no order is created.                                                                             |

`tests/helpers.ts` holds the few steps the tests share (add a product to the cart, check out,
wait for an e-mail). `env.ts` reads the environment variables in one place.

## Why so few tests

End-to-end tests sit at the top of the test pyramid. They are the only tests that prove the
pieces work **together**, but they are slow (seconds, not milliseconds), they need the whole
stack running, and a failure does not say which piece broke. So this suite only covers the
paths that must never break: buying, a declined payment, and the stock coming back. Details
such as every validation rule or every error message are covered by the faster tests of each
service (`web/` with Vitest, `services/store-api` with JUnit).

## Run it locally

Requires Docker, Node 24 and pnpm.

```bash
# 1. From the repository root: start the whole application and leave it running.
docker compose up --build

# 2. In another terminal:
cd e2e
pnpm install
pnpm exec playwright install chromium   # downloads the browser (first time only)
pnpm test
```

Playwright does not start the application (there is no `webServer` in `playwright.config.ts`):
the stack is several containers, so it is started with Docker Compose before the tests.

Other commands:

```bash
pnpm test:headed    # same tests with a visible browser window
pnpm report         # opens the HTML report of the last run
pnpm lint
pnpm format:check
pnpm typecheck
```

## Environment variables

Every variable is optional.

| Variable          | Default                 | Meaning                                                                                   |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`    | `http://localhost:3000` | The web app the browser opens.                                                            |
| `API_URL`         | `http://localhost:8080` | The store API, called directly by `stock.spec.ts`.                                        |
| `MAILPIT_URL`     | `http://localhost:8025` | Mailpit, the fake mail server that catches the e-mails of the notification service.       |
| `E2E_CHECK_EMAIL` | not set                 | Set it to `true` to also check that the "paid" and "cancelled" e-mails arrive in Mailpit. |
| `CI`              | not set                 | Set by GitHub Actions. Turns on one retry per failed test.                                |

Example: `E2E_CHECK_EMAIL=true pnpm test`.

## Reports and traces

After a run, `pnpm report` opens `playwright-report/` in the browser. A failed test has a
screenshot of the page at the moment it failed.

A **trace** is a recording of a test: every step with a snapshot of the page, the network
requests and the console. It is saved when a test is retried (`trace: 'on-first-retry'`),
which only happens on CI. There, download the `playwright-report` artifact of the workflow
run, unzip it and open it with `pnpm exec playwright show-report <folder>`; the trace is
linked from the failed test. To record a trace locally: `pnpm test --trace on`.

## Things to know

- **The tests share one database** and run one at a time (`workers: 1`). They never expect an
  absolute stock number, only a change relative to what they read at the start.
- **Each run really buys 2 units** of the product named in `tests/helpers.ts`, and a local
  database keeps its data. After many local runs the product sells out; reset the demo data
  with `docker compose down -v` and start the stack again. On CI the database is new every run.
- **The stock test assumes nobody else buys its product** while it runs. No other test
  touches that product.
- The texts the tests look for ("Pagar ahora", "Pago aprobado"...) are the real Spanish texts
  of the app, from `web/src/i18n/es.ts`. If a text changes there, change it here too.

## Running against the local Kubernetes cluster

The browser resolves `plaza.localhost` by itself, but Node.js (which makes the API and Mailpit
calls of the tests) does not resolve `*.localhost` names. Against kind, run only the browser
tests and check the emails in <http://plaza.localhost/mailpit>:

```bash
E2E_BASE_URL=http://plaza.localhost pnpm test tests/purchase.spec.ts tests/checkout-validation.spec.ts
```

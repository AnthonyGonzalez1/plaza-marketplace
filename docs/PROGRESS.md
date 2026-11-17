# Progress log

One entry per session, newest first. Each entry ends with the **exact next step**, so the next
session can start without re-deriving context.

---

## Session 6: Payment simulator and idempotency (2026-11-17)

### Done

- `services/payment-simulator` (NestJS 12): `POST /payments` answers 202 and, after a delay,
  calls the store webhook with `APPROVED` or `DECLINED`, signed with HMAC-SHA256; retries with
  backoff; optional duplicate deliveries. 21 Jest tests.
- `store-api`: `POST /api/v1/orders/{id}/payments` (202), webhook endpoint with signature
  check and deduplication (`processed_webhook`), order state machine
  (`PENDING_PAYMENT -> PAID | CANCELLED`), `Idempotency-Key` on checkout (unique constraint),
  job that cancels unpaid orders and returns their stock in one statement. Migration V8.
- Web: pay and "simulate declined" buttons on the order page, polling until the order leaves
  the pending state, idempotency key on checkout.
- Simulator added to `compose.yaml`, the Helm chart, CI (new workflow, image build and scan)
  and Dependabot.
- Tests: 124 backend (2 skipped on purpose), 71 web, 21 simulator.
- Checked on compose and on kind with the real simulator: approved, declined, duplicate
  webhook ignored, unsigned webhook rejected, expired order cancelled with its stock returned.
- Write-up: `docs/payments.md`.

### Decisions

- The webhook signature covers the body only; replays are harmless because events are
  deduplicated by id.
- The idempotency key is a column of `orders` with a `UNIQUE` constraint instead of a
  separate table: the constraint is what stops two simultaneous requests.
- Cancelling and restocking is one SQL statement with CTEs, shared by the declined webhook and
  the expiry job.
- Tests replace the gateway with a fake and switch scheduling off; jobs are called directly.
- The simulator lets the caller choose the outcome, so both paths can be shown in a demo.

### Pending

- Anthony: exercises in `docs/exercises/s6.md`.
- Not verified: the new pages in a real browser, and the simulator image for arm64 (first
  multi-architecture build happens when this is merged).
- Production: `~/plaza-secrets.yaml` on the server needs `payments.webhookSecret`
  (`docs/deploy.md` section 6).
- Late approvals (after cancellation) are only logged; no refund flow.

### Next step

Start **S7 (issue #7)**: branch `feat/events-notifications`: outbox table written in the same
transaction as order changes, relay to RabbitMQ, NestJS `services/notification-service`
consuming `OrderPaid` / `OrderCancelled` and sending email to Mailpit, Playwright e2e test of
the purchase flow.

---

## Session 5: Cart and checkout without overselling (2026-11-16)

### Done

- Cart in Redis (`/api/v1/carts`): one hash per cart, 7-day sliding expiry, prices always read
  from the catalog.
- Migration V7: `orders` (UUID v7 id, status with `CHECK`, `expires_at`) and `order_item`
  (snapshot of product name and unit price).
- `POST /api/v1/orders`: in one transaction, a conditional `UPDATE` reserves the stock of each
  product (sorted by id) and the order is created in `PENDING_PAYMENT`; `409` when stock is
  missing, and nothing stays reserved. `GET /api/v1/orders/{id}`.
- Concurrency test: 50 simultaneous checkouts for 10 units create exactly 10 orders. Checked
  that it fails (50 orders) when the reservation is rewritten as read-then-write.
- Web: add to cart, cart page, guest checkout with email and order page.
- Redis added to `compose.yaml` and to the Helm chart (Deployment without a volume).
- `Inventory` moved to its own `inventory` package; `catalog.ProductLookup` is what cart and
  ordering use to read products.
- Write-up: `docs/sql/checkout-concurrency.md`.

### Decisions

- Conditional `UPDATE` instead of `SELECT ... FOR UPDATE` or a version column: contention is
  the normal case in a flash sale and the rule fits in a `WHERE`.
- The cart reserves nothing; only checkout takes stock.
- Order ids are UUID v7: guests have no account, so the id must not be guessable.
- Checkout commits the order first and deletes the cart afterwards (two systems, no shared
  transaction).
- Redis is not part of the readiness probe: the catalog keeps working if Redis is down.

### Pending

- Anthony: exercises in `docs/exercises/s5.md`.
- Unpaid orders keep their stock reserved until S6 (expiry job). No `Idempotency-Key` yet.
- Validation errors answer a generic "Invalid request content." without naming the field.

### Next step

Start **S6 (issue #6)**: branch `feat/payment-simulator`, NestJS `services/payment-simulator`
(`POST /payments` answers 202 and later calls a signed webhook), webhook endpoint in
`store-api` with the `processed_webhook` table, order state machine, `Idempotency-Key` and
the job that cancels expired orders.

---

## Session 4 (part 1): production deploy prepared (2026-11-16)

The repository side of S4 is done. The server does not exist yet, so nothing here has run on a
real k3s cluster.

### Done

- Images are built for amd64 and arm64 and pushed as one multi-architecture tag. The build
  stages run on the build machine's CPU (`--platform=$BUILDPLATFORM`); only the runtime stage
  is emulated.
- Chart: optional HTTPS (`ingress.tls`): cert-manager annotation, `tls` block and a Traefik
  Middleware that redirects HTTP to HTTPS. `values-prod.yaml` enables it.
- `deploy/k3s/cluster-issuer.yaml`: Let's Encrypt staging and production issuers (HTTP-01).
- `docs/deploy.md`: runbook from an empty Oracle account to `https://<host>`, plus upgrade,
  rollback, troubleshooting and costs.
- CI also lints and renders the chart with the production values.
- Checked on the laptop: both images build and start for arm64 under emulation; with
  `ingress.tls.enabled=true` on kind, HTTP answers `301` to HTTPS and cert-manager creates
  the Certificate; the issuers pass a server-side dry run with cert-manager v1.21.3.
- GHCR: both packages exist and are public (first push happened when S3 was merged).

### Decisions

- Deploys run on the server over SSH; the Kubernetes API port stays closed to the internet.
- The database password is generated on the server and kept in a file there, outside git.
- The redirect to HTTPS is a Middleware inside the chart instead of a change to the Traefik
  bundled with k3s: it travels with the release and needs no cluster-level configuration.
- Only the amd64 image variant is scanned by Trivy; both variants come from one Dockerfile.
- No email in the issuers: it is optional for Let's Encrypt and keeps personal data out of git.

### Pending

- Not verified: the multi-architecture push (first run when this PR is merged), a real
  Let's Encrypt certificate, and the firewall commands of the runbook on Oracle's Ubuntu image.
- Anthony: create the Oracle Cloud account and follow `docs/deploy.md` (exercises in
  `docs/exercises/s4.md`); note anything that differs from the runbook.
- After the first deploy: add the live URL to the README and close issue #4.
- `postgres.storage` cannot be changed after the first install (StatefulSet volume claims are
  immutable); 5Gi is set for production.

### Next step

Anthony runs sections 1-6 of `docs/deploy.md`. Then **S4 part 2** (short): fix the runbook
with what he found, add the live URL to the README, close issue #4. In parallel **S5 (issue
#5)** can start: branch `feat/cart-checkout`, Redis cart, `orders` migrations and the
conditional stock update with its concurrency test.

---

## Session 3: Kubernetes locally (2026-11-16)

### Done

- `deploy/kind/`: one-node kind cluster config, Traefik values and `up.sh` / `down.sh`
  (one command builds the images, loads them and installs everything).
- Helm chart `deploy/helm/plaza`: Deployments and Services for `store-api` and `web`,
  PostgreSQL StatefulSet with a PersistentVolumeClaim, ConfigMap, Secret and an Ingress that
  routes `/api` and the API docs to `store-api` and everything else to `web`.
- `store-api` pod: startup, liveness and readiness probes, memory requests and limits, non-root.
- Verified on the laptop: `http://plaza.localhost` serves the catalog from the kind cluster.
- CI: new `images` workflow builds both images, scans them with Trivy (fails on fixable
  CRITICAL) and, on `main`, pushes them to GHCR; `helm-chart` job lints and renders the chart.
- Dependabot now also covers the web image and the frontend packages (grouped weekly).

### Decisions

- The Ingress routes `/api` straight to `store-api`; the nginx proxy in the web image stays
  only as a fallback.
- PostgreSQL runs from a hand-written StatefulSet (no third-party chart) to keep it explainable.
- The database password is a required chart value and is never committed for real
  environments; `values-local.yaml` holds a throwaway one.
- Images run with numeric user ids: Kubernetes cannot verify `runAsNonRoot` against a user
  name (this broke the first deploy).
- The web image runs `apk upgrade` because the nginx base image shipped a fixable CRITICAL
  vulnerability.
- The Trivy action is pinned to a commit SHA.

### Pending

- Anthony: exercises in `docs/exercises/s3.md` (web probes and resources, breaking probes,
  self-healing and rollback).
- The push to GHCR runs for the first time when this PR is merged; then check that both
  packages exist and make them public (needed to pull them from the server in S4).
- Images are amd64 only; arm64 is added in S4 for the Oracle VM.

### Next step

Start **S4 (issue #4)**: Anthony creates the Oracle Cloud VM (Ampere A1, 2 OCPU, 12 GB) and
points a domain at it; then branch `feat/prod-k3s`: multi-arch images, `values-prod.yaml`,
cert-manager with Let's Encrypt, `docs/deploy.md` runbook and the first `helm upgrade`.

---

## Sessions 1-2: Catalog API, search and web app (2026-11-16)

### Done

- `services/store-api` (Spring Boot 4.1.2, Java 25): store, product, category and inventory
  schema in Flyway migrations V1-V6, 60 seeded products, `GET /api/v1/products` (search,
  filters, sorting, pagination), `/products/{id}`, `/stores`, `/categories`, RFC 9457 errors,
  OpenAPI + Swagger UI, health probes, JSON logs in the `prod` profile.
- Search with hand-written SQL: stored `tsvector` column, accent-insensitive Spanish
  configuration (`plaza_spanish`), GIN index, measured plans in `docs/sql/catalog-search.md`.
- `web/` (React 19, Vite 8, TypeScript 6): catalog with URL-driven search, filters, sorting and
  pagination, product page, nginx image that proxies `/api` to `store-api`.
- `compose.yaml` runs PostgreSQL, `store-api` and `web` with one command.
- CI: `ci.yml` (backend: format check, tests, Docker build) and `web.yml` (lint, types, tests,
  build, Docker build); Dependabot for Maven, Docker and GitHub Actions.
- Tests: 75 backend (unit + Testcontainers, 2 skipped on purpose for the exercises) and 32
  frontend. Full stack verified through compose: the web app reads the real API.

### Decisions

- ADR-0005: Spring Data JPA for entities and simple reads, hand-written SQL (`JdbcClient`)
  where SQL matters.
- TypeScript 6.0 instead of 7.0 because typescript-eslint does not support 7 yet.
- All backend tests run under Surefire, so `./mvnw test` needs Docker running.
- The web app always calls relative `/api` URLs; Vite proxies in dev and nginx in the image.

### Pending

- Anthony's exercises: `docs/exercises/s1.md`, `s2.md` and `s2-web.md`. Use the next free
  migration number (V7) for the S1 constraint exercise.
- Not verified yet: the GitHub Actions workflows (first run happens on the PRs) and dark mode in
  a real browser.
- Host port 5432 is taken on Anthony's laptop: set `PLAZA_DB_PORT` in a local `.env`.
- `Inventory` lives in the `catalog` package for now; it moves to its own module in S5.
- On Kubernetes the web image needs the fully qualified service name in `API_UPSTREAM` (S3).

### Next step

Start **S3 (issue #3)**: create branch `feat/k8s-local`, add `deploy/kind/cluster.yaml` and the
Helm chart `deploy/helm/plaza` (store-api, web, PostgreSQL StatefulSet, Ingress with Traefik),
then make CI publish images to GHCR and scan them with Trivy.

---

## Session 0: Planning and repository bootstrap (2026-11-16)

### Done

- Market research (414 job postings, Stack Overflow 2025/2026, State of JS 2025, CNCF 2025),
  version checks and free hosting options. Summary in ADR-0001 and ADR-0004.
- Chose the project (Plaza) and the stack; emphasis on SQL, tests and REST, Kubernetes as plus.
- Created the public repository `AnthonyGonzalez1/plaza-marketplace` (MIT).
- Added `docs/STANDARDS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`,
  `docs/adr/0001` to `0004`, 5 GitHub milestones (M1-M5) and issues #1-#16 (one per session).
- Installed on Anthony's laptop: kind 0.33.0, Helm 4.3.2, Temurin JDK 25.0.5 (now the system
  `JAVA_HOME`; JDK 21 is still installed), Docker Desktop upgraded.

### Decisions

- ADR-0001: Plaza; Java 25 + Spring Boot 4.1, NestJS 12, React 19, PostgreSQL 18, Redis 8,
  RabbitMQ 4.
- ADR-0002: modular monolith (`store-api`) + two NestJS satellites.
- ADR-0003: RabbitMQ with a hand-written transactional outbox.
- ADR-0004: production on single-node k3s in Oracle Cloud Always Free; Azure and PaaS as
  fallbacks.
- Repository artifacts in English; explanations to Anthony in Spanish.

### Pending

- Anthony: review and merge the bootstrap PR.
- Anthony, before S4: apply for the GitHub Student Developer Pack, create the Oracle Cloud
  account, activate Azure for Students (plan B).
- Anthony, optional: fill in the GitHub profile (bio, location, profile README).

### Next step

Start **S1 (issue #1)**: create branch `feat/store-api-skeleton`,
generate the Spring Boot 4.1 project in `services/store-api` (Java 25, Maven wrapper, web,
validation, data-jdbc or data-jpa, Flyway, PostgreSQL driver, Actuator, springdoc, Testcontainers),
then write `compose.yaml` with PostgreSQL 18. First decision to make with Anthony in S1:
Spring Data JPA vs Spring Data JDBC/JdbcTemplate (record it as ADR-0005).

# Roadmap

A **session** is a 2-3 hour working block. At 1-2 sessions per week, the first public URL lands
2-4 weeks after Session 1 and the MVP 4-7 weeks after it. The roadmap is planned in sessions, not
dates; if a session runs over, the next one starts where it stopped (see `docs/PROGRESS.md`).

Priorities, in order: **SQL, automated tests and REST API design** (what junior interviews
actually probe), then containers, CI/CD and Kubernetes as the differentiator.

## Overview

| Milestone | Sessions | Result |
|---|---|---|
| M1 Foundations | S1-S2 | Catalog API + web running locally with one command, CI green |
| M2 First public URL | S3-S4 | Same app on Kubernetes: kind locally, k3s in production, HTTPS |
| **M3 MVP** | **S5-S7** | **Cart, checkout without overselling, payment webhooks, events and notifications, deployed** |
| M4 Quality and security | S8-S11 | CD with Kubernetes validated in CI, OIDC auth, seller panel, SQL reporting |
| M5 Operations and polish | S12-S16 | Load test, observability, IaC, hardening, final README |

The MVP is complete at S7 of 16, before the halfway point. Everything after it is incremental.

## Prerequisites outside sessions (Anthony)

| Needed by | Task |
|---|---|
| S1 | Docker Desktop running; WSL memory limit (`.wslconfig`) is set up in S1 |
| S4 | Oracle Cloud account created (card verification hold, no charge) |
| S4 | GitHub Student Developer Pack approved (free domain for one year) |
| S4 (plan B) | Azure for Students activated with the UPTC email (USD 100, no card) |

## Sessions

### M1 Foundations

#### S1: Walking skeleton of `store-api`

- **Goal:** the first vertical slice runs locally and in CI.
- **Deliverables:**
  - Spring Boot 4.1 project (Java 25, Maven wrapper) in `services/store-api`, package per module.
  - `compose.yaml` with PostgreSQL 18 and `store-api` (multi-stage Dockerfile).
  - Flyway `V1`: `store` and `product` tables with primary keys, foreign keys, `NOT NULL`,
    `CHECK (price > 0)` and `UNIQUE (store_id, slug)`.
  - `GET /api/v1/products` and `GET /api/v1/products/{id}`; springdoc OpenAPI + Swagger UI.
  - Actuator health (liveness/readiness) and structured JSON logs.
  - Tests: one unit test, one Testcontainers integration test (repository + endpoint).
  - GitHub Actions CI: format/lint check, `./mvnw verify`, Docker build. Dependabot config.
  - `.env.example`, `.wslconfig` recommendation, commands documented in the README.
- **Done when:** `docker compose up` serves `/api/v1/products` and `/actuator/health` returns
  UP; CI is green on the PR.
- **Anthony's part:** write the `V1` migration constraints and one integration test case.
- **Concepts:** Spring Boot layers, dependency injection, Flyway, Testcontainers, CI basics.

#### S2: Catalog end to end with real SQL

- **Goal:** a buyer can browse and search the catalog in the browser.
- **Deliverables:**
  - Migrations: `category`, `inventory` (`available >= 0`), seed data for 3 stores and ~60
    products.
  - Search with PostgreSQL full-text (`tsvector`, Spanish configuration, GIN index); filters by
    store, category and price; sorting; pagination with metadata.
  - Errors as RFC 9457 problem details; request validation.
  - `EXPLAIN ANALYZE` of the search query before and after the index, written up in
    `docs/sql/catalog-search.md`.
  - `web/`: React + Vite + TypeScript catalog and product pages; ESLint + Vitest; Dockerfile
    (nginx); added to compose and CI.
  - API tests (MockMvc or RestAssured) for filters, pagination and error cases.
- **Done when:** search works in the browser through compose; the index is proven used in
  `EXPLAIN`; CI runs backend and frontend jobs.
- **Anthony's part:** write the search SQL (or the index) and interpret the query plan.
- **Concepts:** normalization, constraints vs validation, indexes and query plans, offset vs
  keyset pagination, HTTP status codes.

### M2 First public URL

#### S3: Kubernetes locally

- **Goal:** the same stack runs on a local Kubernetes cluster.
- **Deliverables:**
  - `deploy/kind/cluster.yaml`; Traefik as ingress controller (same as k3s in production).
  - Helm chart `deploy/helm/plaza`: Deployments for `store-api` and `web`, PostgreSQL
    StatefulSet with a PVC, Services, Ingress, ConfigMap, Secret, readiness/liveness probes,
    resource requests and limits, `values-local.yaml`.
  - CI publishes images to GHCR on merge to `main`; Trivy scans images (fail on CRITICAL).
  - One-command script to create the cluster and install the chart.
- **Done when:** the catalog is reachable at `http://plaza.localhost` from the kind cluster;
  images appear in GHCR.
- **Anthony's part:** write the probes and resource values, then break a probe on purpose and
  explain what Kubernetes does.
- **Concepts:** Pod, Deployment, Service, Ingress, ConfigMap/Secret, StatefulSet, probes, Helm
  templating and values.

#### S4: Production on k3s: first public URL

- **Goal:** the catalog is live on the internet over HTTPS.
- **Deliverables:**
  - Oracle Cloud Ampere A1 VM (2 OCPU, 12 GB), firewall rules, budget alert configured.
  - k3s installed; cert-manager with Let's Encrypt; domain from the Student Pack (fallback: a
    free `sslip.io` host name).
  - Multi-architecture images (amd64 + arm64).
  - `values-prod.yaml`; first deploy with `helm upgrade --install`; runbook in
    `docs/deploy.md`.
  - README: description, live demo link, local run in one command, architecture diagram.
- **Done when:** `https://<domain>` serves the catalog and the API docs; README links it.
- **Anthony's part:** create the cloud account and the VM following the runbook (he owns the
  console steps), and run the first `helm upgrade` himself.
- **Concepts:** single-node k3s vs managed Kubernetes, TLS and ACME, DNS, ARM images.
- **Plan B:** same chart on an Azure for Students VM; plan C (no Kubernetes in prod) is in
  ADR-0004.

### M3 MVP

#### S5: Cart and checkout without overselling

- **Goal:** two buyers can never buy the same last unit.
- **Deliverables:**
  - Cart in Redis with TTL (`/api/v1/carts`).
  - Migrations: `orders`, `order_item` (price snapshot), order status with `CHECK`.
  - `POST /api/v1/orders`: in one transaction, conditional stock decrement
    (`UPDATE inventory SET available = available - :qty WHERE product_id = :id AND available >= :qty`)
    and order creation in `PENDING_PAYMENT` with `expires_at`.
  - Concurrency integration test: 50 parallel checkouts for 10 units, exactly 10 succeed.
  - Web: cart and checkout pages (guest checkout with email).
  - Redis and the new pieces added to compose and the Helm chart.
- **Done when:** the concurrency test passes in CI; checkout works locally.
- **Anthony's part:** write the conditional update and explain why it is safe without
  `SELECT ... FOR UPDATE`; compare both approaches.
- **Concepts:** transactions and isolation levels, race conditions, row locks, optimistic vs
  pessimistic concurrency.

#### S6: Payment simulator and idempotency

- **Goal:** payments are confirmed asynchronously and duplicates are harmless.
- **Deliverables:**
  - `services/payment-simulator` (NestJS): `POST /payments` answers `202`, later calls the
    store webhook with `APPROVED` or `DECLINED` (configurable), signed with HMAC.
  - `store-api` webhook endpoint: signature check, `processed_webhook` table with a unique key,
    order state machine (`PENDING_PAYMENT -> PAID | CANCELLED`).
  - `Idempotency-Key` header on `POST /api/v1/orders`.
  - Scheduled job that cancels expired orders and returns stock in one transaction.
  - Tests: duplicate webhook, invalid signature, expiry job (Testcontainers); Jest tests for the
    simulator.
- **Done when:** sending the same webhook twice changes the order once (test); expired orders
  release stock (test).
- **Anthony's part:** implement the order state transition rules and their unit tests.
- **Concepts:** idempotency, webhooks, HMAC, state machines, at-least-once delivery.

#### S7: Events and notifications: MVP complete

- **Goal:** the full purchase flow works on the public URL.
- **Deliverables:**
  - Transactional outbox table written in the same transaction as the order change; relay that
    publishes to RabbitMQ.
  - `services/notification-service` (NestJS): consumes `OrderPaid` and `OrderCancelled`, sends
    email to Mailpit, records notifications; retry and dead-letter queue.
  - Order status page in the web app.
  - Playwright e2e test of the happy path against compose, in CI.
  - Production deploy of all services; memory check on the 12 GB VM.
- **Done when:** on the public URL a visitor can browse, add to cart, check out, pay and see the
  order become `PAID`; the e2e test is green in CI.
- **Anthony's part:** write the notification consumer handler and its test.
- **Concepts:** dual-write problem, outbox pattern, eventual consistency, queues vs exchanges,
  dead-letter queues.

### M4 Quality and security

#### S8: Kubernetes in CI and continuous deployment

- **Deliverables:** CI job that creates a kind cluster in GitHub Actions, installs the chart and
  runs smoke tests (health, catalog, checkout); CD on merge to `main` (build, push, `helm
  upgrade` on k3s, smoke test, automatic rollback on failure).
- **Done when:** a merged PR reaches production without manual steps, and a broken deploy rolls
  back by itself.
- **Anthony's part:** write the smoke test script.
- **Concepts:** CI vs CD, Helm releases and rollback, GitHub Secrets and environments.

#### S9: Authentication with OIDC

- **Deliverables:** Keycloak with realm-as-code (roles `buyer`, `seller`, `admin`); `store-api`
  as OAuth2 resource server validating JWTs; React login with Authorization Code + PKCE;
  "my orders" endpoint; security tests with mocked JWTs.
- **Done when:** protected endpoints return `401`/`403` correctly (tests) and login works in
  production.
- **Anthony's part:** write the authorization rules and their tests.
- **Concepts:** OAuth2 vs OIDC, access and ID tokens, JWT validation, PKCE.

#### S10: Seller panel and REST maturity

- **Deliverables:** seller product CRUD (`POST/PUT/PATCH/DELETE`); optimistic locking with a
  `version` column plus `ETag`/`If-Match` (`412` on conflict); committed OpenAPI spec with a
  breaking-change check in CI; API conventions written in `docs/api-guidelines.md`.
- **Done when:** concurrent edits are detected (test) and CI fails on a breaking API change.
- **Anthony's part:** implement the `PATCH` endpoint and its tests.
- **Concepts:** HTTP semantics and idempotent methods, conditional requests, API versioning.

#### S11: SQL reporting for sellers

- **Deliverables:** seller dashboard (sales per day, top products, cumulative revenue) using
  CTEs, window functions and aggregates; seed script with ~100k orders for realistic plans;
  indexes justified with `EXPLAIN ANALYZE` and `pg_stat_statements`; a materialized view if a
  query needs it; write-up in `docs/sql/reporting.md`.
- **Done when:** every dashboard query runs under the target time on the 100k-order dataset,
  documented with its plan.
- **Anthony's part:** write two of the reporting queries.
- **Concepts:** window functions, CTEs, composite and partial indexes, materialized views.

### M5 Operations and polish

#### S12: Load test of the flash sale

- **Deliverables:** k6 scenario (many buyers, few units); results and tuning (connection pool,
  indexes) in the README.
- **Done when:** the report shows zero oversold units and the measured throughput.

#### S13: Observability

- **Deliverables:** Micrometer/OpenTelemetry metrics and traces across `store-api`, RabbitMQ and
  `notification-service`; Prometheus and Grafana with a RED dashboard and business metrics.
- **Done when:** a single purchase can be followed as one trace, and the dashboard is linked
  from the README.

#### S14: Infrastructure as code

- **Deliverables:** OpenTofu for the Oracle VM, network and firewall, with cloud-init installing
  k3s; existing resources imported; remote state; budget alert as code. Apply only with
  Anthony's confirmation.
- **Done when:** `tofu plan` shows no drift against production.

#### S15: Security hardening

- **Deliverables:** rate limiting, security headers, NetworkPolicies, non-root containers with
  read-only filesystems, encrypted secrets in git (Sealed Secrets or SOPS), nightly PostgreSQL
  backup CronJob.
- **Done when:** Trivy and the checks pass, and a restore from backup is tested.

#### S16: Portfolio polish and v1.0.0

- **Deliverables:** final README (GIF, screenshots, architecture, decisions, results), demo data
  reset CronJob, interview notes in `docs/interview-notes.md`, release `v1.0.0`.
- **Done when:** a recruiter understands the project in two minutes from the README.

## When each standard comes in

| Standard | Session |
|---|---|
| Conventional Commits, feature branches, PRs | S1 |
| Unit tests, integration tests with Testcontainers | S1 |
| CI: lint, tests, build | S1 |
| Dependabot | S1 |
| docker compose, multi-stage Dockerfiles | S1 (API), S2 (web) |
| `.env.example`, config via environment | S1 |
| OpenAPI documentation | S1 (springdoc), S10 (committed spec + breaking-change check) |
| Health checks, structured logs | S1 |
| Images in GHCR, Trivy scan | S3 |
| Kubernetes locally (kind + Helm) | S3 |
| Public deployment with URL | S4 |
| Budget alerts (card registered on Oracle) | S4 (console), S14 (as code) |
| README: description, demo, one-command run, architecture | S4 (first version), S16 (final) |
| Concurrency tests | S5 |
| e2e tests (Playwright) | S7 |
| Kubernetes validated in CI (kind), continuous deployment | S8 |
| OAuth2/OIDC + JWT | S9 |
| Metrics and traces (OpenTelemetry, Prometheus, Grafana) | S13 |
| Infrastructure as code (OpenTofu) | S14 |

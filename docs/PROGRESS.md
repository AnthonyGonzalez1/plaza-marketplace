# Progress log

One entry per session, newest first. Each entry ends with the **exact next step**, so the next
session can start without re-deriving context.

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

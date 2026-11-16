# Progress log

One entry per session, newest first. Each entry ends with the **exact next step**, so the next
session can start without re-deriving context.

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

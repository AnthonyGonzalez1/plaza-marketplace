# Progress log

One entry per session, newest first. Each entry ends with the **exact next step**, so the next
session can start without re-deriving context.

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

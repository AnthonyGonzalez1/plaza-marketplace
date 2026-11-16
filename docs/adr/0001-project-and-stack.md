# ADR-0001: Project choice and technology stack

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Anthony is a final-year Systems Engineering student (UPTC, Colombia) looking for an internship or
junior backend/full-stack role, both in Colombia and remote. His GitHub shows almost no work, so
the goal is one serious, deployed portfolio project soon, rather than a huge unfinished one.

Constraints:

- 2-5 hours per week (1-2 sessions of 2-3 hours). Hosting budget: USD 0 unless unavoidable.
- Laptop with 16 GB RAM on Windows 11 + WSL2, so local Kubernetes must stay small.
- Known: TypeScript (NestJS, Angular, React), Docker. Some Java/Spring from university.
  Little SQL beyond basic PostgreSQL. No real Kubernetes or messaging experience.
- He wants simple, explainable code, and e-commerce as the domain.

Market research (October 2026; full notes kept outside the repo):

- 414 job postings were analysed by keyword: Get on Board (312, LatAm/remote), elempleo (20),
  Computrabajo (54) and LinkedIn (28) for Colombia. Only 11 of 312 Get on Board postings were
  junior, and those asked for Git, REST, SQL and Docker, never for Kubernetes or Kafka.
- In Colombian postings Java/Spring and C#/.NET were roughly tied (Java 35 % and .NET 30 % on
  elempleo, 15 % each on Computrabajo); Go appeared in 4-8 %.
- PostgreSQL was the most mentioned database in every source; React was the most mentioned
  frontend (41 % on Get on Board).
- Stack Overflow Developer Survey 2025 (professional developers): Docker 73.8 %, Kubernetes
  30.1 %, Spring Boot 15.6 %, NestJS 7.4 %. CNCF Annual Survey 2025: 82 % of container users run
  Kubernetes in production.

## Decision

Build **Plaza**, an order platform for a marketplace of small merchants, whose core technical
challenge is consistency under concurrency: no overselling, idempotent payment confirmation and
reliable event delivery. The project prioritises **SQL, automated tests and REST API design**,
with Kubernetes as the differentiator.

| Area | Choice | Reason |
|---|---|---|
| Main backend | Java 25 LTS + Spring Boot 4.1, Maven | Most demanded second backend language in the sample; Anthony already knows some Spring; Maven's explicit configuration is easy to read |
| Satellite services | NestJS 12 on Node.js 26 LTS | Reuses his TypeScript skills and shows two stacks working together |
| Frontend | React 19 + Vite + TypeScript | Most demanded frontend; a plain SPA keeps the frontend simple to explain |
| Database | PostgreSQL 18 + Flyway | Most demanded database; the domain needs transactions, constraints, locks and indexes |
| Second data store | Redis 8 | Carts with expiry and idempotency keys: real, simple uses |
| Messaging | RabbitMQ 4 + outbox (ADR-0003) | Simpler than Kafka for task-style events |
| Tests | JUnit 5, Testcontainers, MockMvc/RestAssured, Jest, Playwright, k6 | Tests appear in 43-47 % of postings and are where junior candidates stand out |
| Containers and orchestration | Docker, compose, kind, Helm, k3s | Required by the brief; same chart from laptop to production |
| Auth | Keycloak (OIDC) + JWT, after the MVP | Standards-based auth without blocking the first deploy |
| Hosting | k3s on Oracle Cloud Always Free (ADR-0004) | Real Kubernetes in production at USD 0 |

Versions were verified on 2026-11-16 against endoflife.date and the projects' GitHub releases.

## Alternatives considered

| Option | Why not |
|---|---|
| Ticketing with a virtual queue (Go) | Hardest option; Go is rare in junior Colombian postings |
| Price tracker (C#/.NET) | The demo would depend on scraping third-party stores (terms of use, fragility) |
| Shipment tracking (Java + Kafka) | Kafka adds complexity and RAM for little junior-market value now; good second project |
| Product search as a service (Java + Python + pgvector) | Three languages in a first project; good follow-up project |
| C#/.NET instead of Java | Equally valid in Colombia; Java wins on prior experience and the regional sample |

## Consequences

- Anthony learns SQL in depth through real problems instead of exercises.
- Two languages and four deployables are more to maintain than a single app; the modular
  monolith (ADR-0002) keeps the core in one place.
- The project has no AI or Kafka; those are left for a second project.

# ADR-0005: Spring Data JPA for entities, hand-written SQL where SQL matters

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

`store-api` needs a persistence approach. Two forces pull in different directions:

- Java job postings for junior roles ask for JPA/Hibernate almost always, so the project must
  show it.
- The project's main focus is SQL. Full-text search, the conditional stock decrement (S5) and
  the seller reports (S11) depend on PostgreSQL features and on the exact query that runs. An
  ORM hides that query, which is the part that has to be explained in an interview.

## Decision

Use **both, each where it fits**, on the same `DataSource` and the same transactions:

- **Spring Data JPA (Hibernate)** for entities and simple reads and writes: load by id, list a
  small table, save an entity.
- **Hand-written SQL** through Spring's `JdbcClient` (or a native query) where the SQL itself
  matters: catalog search now; stock decrement and reporting later. The SQL lives in a dedicated
  repository class per use case, always with named parameters.

Rules that go with it:

- **Flyway owns the schema.** `spring.jpa.hibernate.ddl-auto=validate`: Hibernate never creates
  or alters tables, it only fails at startup if an entity does not match the migrations.
- `spring.jpa.open-in-view=false`: all data is loaded inside the service method; nothing is
  lazy-loaded while the JSON is written.
- Identifiers of `store`, `category` and `product` are `bigint GENERATED ALWAYS AS IDENTITY`.
  Money is `numeric(12,2)` (`BigDecimal` in Java) with the currency fixed to COP for now.
  Timestamps are `timestamptz`.
- No Lombok or MapStruct: entities have explicit getters and the entity-to-DTO mapping is plain
  static methods. DTOs are Java records.

## Alternatives considered

| Option | Why not |
|---|---|
| JPA only (JPQL, Criteria, Specifications) | Full-text search and ranking are not expressible in JPQL; dynamic filters with Criteria are harder to read than SQL, and the generated query is not the one we would explain |
| Spring Data JDBC or `JdbcClient` only | Simple and explicit, but leaves JPA/Hibernate, the most requested persistence skill, out of the project |
| jOOQ | Type-safe SQL, but one more tool and code generator to learn and justify; plain SQL strings are enough at this size |
| Let Hibernate generate the schema (`ddl-auto=update`) | No reviewable history of schema changes, unsafe in production, and constraints and indexes would be written by a tool instead of by us |

## Consequences

- Two ways to reach the database: the rule above (simple access with JPA, SQL-heavy use cases
  with `JdbcClient`) must be followed so that the choice is predictable.
- Rows changed with hand-written SQL are not seen by entities already loaded in the same
  Hibernate session. Do not mix both styles on the same rows inside one transaction (this will
  matter for the stock decrement in S5).
- Every schema change needs a migration and, if a table is mapped, the matching entity change;
  `validate` catches a mismatch when the application or the tests start.
- Hand-written SQL is only checked when it runs, so every such query needs an integration test
  against real PostgreSQL (Testcontainers).

# ADR-0002: Modular monolith with two satellite services

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

The brief asks for a non-trivial architecture with at least 2-3 services, synchronous and
asynchronous communication, and code simple enough for a junior developer to explain. Orders,
inventory and payments must change together inside database transactions to avoid overselling.

## Decision

`store-api` is a **modular monolith** in Spring Boot: one deployable and one database, organised
in business modules (`catalog`, `cart`, `ordering`, `inventory`, `payments`, `shared`). Modules
call each other only through public service classes.

Two **satellite services** in NestJS sit outside it, where a separate process is natural:

- `payment-simulator`: plays the role of an external payment gateway (sync REST in, async
  webhook out).
- `notification-service`: consumes order events from RabbitMQ.

## Alternatives considered

| Option | Why not |
|---|---|
| Microservices per module (catalog, orders, inventory, payments) | Checkout would need a distributed saga for something one local transaction solves; more infrastructure, more RAM, harder to explain |
| A single monolith with no other services | Does not meet the brief and shows no inter-service communication |

## Consequences

- Stock and orders stay consistent with plain ACID transactions.
- Module boundaries are a convention, so they must be checked in code review (an architecture
  test can enforce them later).
- If a module ever needs to be extracted, the module boundaries and the events already in place
  make that possible; this is a common interview discussion point.

# ADR-0003: RabbitMQ with a transactional outbox

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

When an order is paid or cancelled, other parts of the system (notifications now, others later)
must react without slowing down or coupling the checkout. If `store-api` updates the order in
PostgreSQL and then publishes to a broker as two separate steps, a crash between them either
loses the event or announces a change that was rolled back (the "dual-write" problem).

## Decision

- Use **RabbitMQ 4** as the message broker (topic exchange `orders`, one queue per consumer,
  dead-letter queue for poison messages).
- Use a **transactional outbox**: the order change and an `outbox_event` row are written in the
  same database transaction. A scheduled relay in `store-api` reads pending rows, publishes them,
  and marks them as sent.
- Delivery is **at least once**, so consumers must be idempotent (track processed event ids).

The outbox is implemented by hand (one table, one scheduled job) so every line can be explained.

## Alternatives considered

| Option | Why not |
|---|---|
| Apache Kafka | Built for high-volume ordered streams and replay; heavier (RAM, concepts) than this domain needs. Kept for a future project |
| Publish directly after commit | Loses events if the process dies between commit and publish |
| Spring Modulith event externalisation | Solves the same problem, but hides the mechanism a junior must be able to explain |
| Debezium change data capture | Extra infrastructure (Kafka Connect) for a single small service |

## Consequences

- Events are never lost once the order is committed; duplicates are possible and handled.
- Events are delayed by the relay interval (around one second), which is acceptable here.
- The outbox table needs cleanup of sent rows (a scheduled job or retention query).

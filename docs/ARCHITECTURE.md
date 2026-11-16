# Architecture

Status: **planned design** (Session 0). Each section is updated when its part is built; mark
anything that changes with a new ADR in `docs/adr/`.

## 1. System context (C4 level 1)

```mermaid
flowchart TB
    buyer["Buyer<br/>[Person]<br/>Browses stores, buys products"]
    seller["Seller<br/>[Person]<br/>Manages products and sees sales (from S10)"]
    plaza["Plaza Marketplace<br/>[Software system]<br/>Catalog, cart, checkout, orders, notifications"]
    email["Email server<br/>[External system]<br/>Mailpit in dev; real provider is an extension"]
    idp["Keycloak<br/>[Identity provider, from S9]<br/>OIDC login"]

    buyer -->|"Uses (HTTPS)"| plaza
    seller -->|"Uses (HTTPS)"| plaza
    plaza -->|"Sends order emails (SMTP)"| email
    plaza -->|"Validates tokens (OIDC/JWT)"| idp
```

The payment gateway is part of the system on purpose: `payment-simulator` imitates a real
gateway (asynchronous confirmation by signed webhook) so the demo never depends on a third party.

## 2. Containers (C4 level 2)

```mermaid
flowchart LR
    buyer["Buyer / Seller<br/>[Person]"]

    subgraph plaza["Plaza Marketplace"]
        web["web<br/>[React SPA, nginx]<br/>Catalog, cart, checkout, order status"]
        api["store-api<br/>[Spring Boot, Java 25]<br/>Modular monolith: catalog, cart,<br/>ordering, inventory, payments"]
        pay["payment-simulator<br/>[NestJS]<br/>Fake gateway, signed webhooks"]
        notif["notification-service<br/>[NestJS]<br/>Consumes order events, sends email"]
        pg[("PostgreSQL 18<br/>[Relational DB]<br/>Source of truth + outbox")]
        redis[("Redis 8<br/>[Cache]<br/>Carts with TTL, idempotency keys")]
        mq[["RabbitMQ 4<br/>[Message broker]<br/>Order events"]]
    end

    buyer -->|"HTTPS"| web
    web -->|"REST/JSON /api/v1"| api
    api -->|"SQL (JDBC)"| pg
    api -->|"RESP"| redis
    api -->|"REST: create payment"| pay
    pay -->|"REST: webhook (HMAC)"| api
    api -->|"AMQP: publish via outbox relay"| mq
    mq -->|"AMQP: consume"| notif
```

**Synchronous:** browser to `store-api` (REST), `store-api` to `payment-simulator` (REST), and
the webhook back. **Asynchronous:** order events through RabbitMQ to `notification-service`.

## 3. Deployment

| Environment | How it runs |
|---|---|
| Local dev | `docker compose up` (all containers + Mailpit) |
| Local Kubernetes | kind cluster, Traefik ingress, Helm chart with `values-local.yaml` |
| CI (from S8) | kind cluster inside GitHub Actions, chart installed, smoke tests |
| Production | Single-node k3s on an Oracle Cloud Ampere A1 VM (ARM64, 2 OCPU, 12 GB), Traefik, cert-manager + Let's Encrypt, same chart with `values-prod.yaml` |

```mermaid
flowchart LR
    internet["Internet"] -->|"HTTPS 443"| traefik
    subgraph vm["Oracle Cloud VM (k3s single node)"]
        traefik["Traefik ingress<br/>+ cert-manager TLS"]
        traefik --> webpod["web Deployment"]
        traefik --> apipod["store-api Deployment"]
        apipod --> pgsts[("PostgreSQL StatefulSet + PVC")]
        apipod --> redispod[("Redis")]
        apipod --> paypod["payment-simulator"]
        apipod --> mqsts[["RabbitMQ"]]
        mqsts --> notifpod["notification-service"]
    end
    gh["GitHub Actions"] -->|"push images"| ghcr["GHCR"]
    gh -->|"helm upgrade (from S8)"| traefik
    ghcr -->|"pull images"| vm
```

## 4. Checkout flow (MVP)

```mermaid
sequenceDiagram
    actor B as Buyer
    participant W as web
    participant A as store-api
    participant DB as PostgreSQL
    participant P as payment-simulator
    participant MQ as RabbitMQ
    participant N as notification-service

    B->>W: Confirm checkout
    W->>A: POST /api/v1/orders (Idempotency-Key)
    A->>DB: BEGIN, conditional stock decrement, insert order PENDING_PAYMENT, COMMIT
    A->>P: POST /payments
    P-->>A: 202 Accepted
    A-->>W: 201 Created (order)
    P->>A: POST /api/v1/payments/webhook (HMAC signature)
    A->>DB: BEGIN, record webhook id (unique), order PAID, insert outbox event, COMMIT
    A->>MQ: Relay publishes OrderPaid
    MQ->>N: OrderPaid
    N->>N: Send email, record notification
    Note over A,DB: A scheduled job cancels unpaid orders after expires_at and returns the stock
```

## 5. Initial data model (MVP)

```mermaid
erDiagram
    STORE ||--o{ PRODUCT : sells
    CATEGORY ||--o{ PRODUCT : classifies
    PRODUCT ||--|| INVENTORY : "has stock"
    ORDERS ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : "is bought as"

    STORE {
        bigint id PK
        text name
        text slug UK
    }
    CATEGORY {
        bigint id PK
        text name
    }
    PRODUCT {
        bigint id PK
        bigint store_id FK
        bigint category_id FK
        text name
        text slug
        numeric price
        tsvector search_vector
    }
    INVENTORY {
        bigint product_id PK
        int available
    }
    ORDERS {
        uuid id PK
        text buyer_email
        text status
        numeric total
        timestamptz expires_at
    }
    ORDER_ITEM {
        uuid order_id FK
        bigint product_id FK
        int quantity
        numeric unit_price
    }
```

Supporting tables: `outbox_event` (pending events for the relay), `processed_webhook` (unique
webhook ids for idempotency) and `flyway_schema_history`.

## 6. `store-api` modules

One deployable, organized by business module, not by technical layer:

```
catalog/     products, categories, stores, search
cart/        Redis-backed carts
ordering/    orders, checkout, order state machine, expiry job
inventory/   stock and conditional decrement
payments/    payment client and webhook endpoint
shared/      outbox, error handling (problem details), config
```

Rule: a module talks to another only through its public service classes, never through another
module's repositories or tables.

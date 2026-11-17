# Checkout: selling the last unit only once

Two buyers press "buy" at the same instant and one unit is left. This document explains why
exactly one of them gets it, and what the alternatives would have been.

## The bug to avoid: check, then act

The obvious code reads the stock and then writes the new value:

```sql
SELECT available FROM inventory WHERE product_id = 12;      -- both buyers read 1
-- application: 1 >= 1, so go ahead
UPDATE inventory SET available = 0 WHERE product_id = 12;   -- both buyers write 0
```

| Time | Buyer A | Buyer B | `available` |
|---|---|---|---|
| 1 | reads 1 | | 1 |
| 2 | | reads 1 | 1 |
| 3 | writes 0, creates order | | 0 |
| 4 | | writes 0, creates order | 0 |

Two orders, one unit. Nothing failed, no error was logged: this is a **race condition** (a
"lost update"), and it only shows up under concurrency. It can be reproduced: with this code
`CheckoutConcurrencyIntegrationTest` reports 50 orders for 10 units.

## What the project does: one conditional UPDATE

```sql
UPDATE inventory
SET available = available - :quantity
WHERE product_id = :productId
  AND available >= :quantity;
```

The application looks at the number of updated rows: `1` means reserved, `0` means not enough
stock.

Why it is safe:

1. An `UPDATE` takes a **row lock**. The second transaction that tries to update the same row
   waits until the first one commits or rolls back.
2. When it is released, PostgreSQL (in the default `READ COMMITTED` isolation level)
   **re-evaluates the `WHERE` clause on the new version of the row**. The stock is now 0,
   `0 >= 1` is false, and the statement updates 0 rows.
3. Check and write are a single statement, so no other transaction can get in between.

| Time | Buyer A | Buyer B | `available` |
|---|---|---|---|
| 1 | `UPDATE` locks the row, sets 0 | | 0 (uncommitted) |
| 2 | | `UPDATE` waits for the lock | |
| 3 | commits | | 0 |
| 4 | | re-checks `available >= 1`: false, 0 rows | 0 |

The `CHECK (available >= 0)` constraint of migration V4 remains as the last line of defence:
even wrong application code could not store a negative stock.

## All or nothing: the transaction

`OrderService.placeOrder` runs inside one transaction: reserve every product, insert the
order, insert its items. If the third product has no stock, the exception rolls everything
back and the units taken from the first two products return. There is never stock without an
order or an order without stock.

## Deadlocks and lock order

An order with several products locks several rows. If order A locks product 1 and then wants
product 2, while order B locked product 2 and wants product 1, both wait forever. PostgreSQL
detects the cycle and aborts one of them with a `deadlock detected` error.

The fix is a rule: **always lock in the same order**. The code reserves products sorted by id,
so two orders can wait for each other, but never in a cycle.

## Alternatives

| Approach | How | Trade-off |
|---|---|---|
| **Conditional UPDATE** (used) | One statement checks and writes | Simplest and fastest; only works when the rule fits in a `WHERE` |
| Pessimistic lock | `SELECT ... FOR UPDATE`, decide in the application, then `UPDATE` | Allows complex rules in code; two round trips and the lock is held longer |
| Optimistic lock | `version` column; `UPDATE ... WHERE version = :read`; retry on 0 rows | No waiting; under high contention (a flash sale) most attempts fail and retry |
| `SERIALIZABLE` isolation | The database aborts transactions that would conflict | Correct for any logic; the application must retry aborted transactions |

Seller edits of a product (S10) will use the optimistic approach, where conflicts are rare.
For stock in a flash sale, contention is the normal case, so the conditional update fits best.

## What is not solved yet

- An order that is never paid keeps its units reserved. The job that cancels expired orders
  and returns the stock arrives with payments (S6).
- A buyer who retries `POST /api/v1/orders` after a network error cannot buy twice only
  because the cart is deleted after the first success. A proper `Idempotency-Key` arrives in
  S6.

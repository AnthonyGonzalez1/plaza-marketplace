package com.plaza.store.inventory;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Changes stock. Plain SQL on purpose: the whole point is one precise statement. */
@Repository
public class StockRepository {

    private final JdbcClient jdbc;

    public StockRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Takes {@code quantity} units of a product out of the stock, but only if that many are left.
     *
     * <p>Check and decrement happen in ONE statement. PostgreSQL locks the row while it updates it,
     * so when two buyers want the last unit at the same instant, the second UPDATE waits for the
     * first transaction to finish, then evaluates {@code available >= :quantity} again on the new
     * value, finds it false and changes nothing. Reading the stock first and writing it later (two
     * statements) would let both buyers see "1 left" and both buy it.
     *
     * @return true if the units were reserved, false if there was not enough stock
     */
    public boolean reserve(long productId, int quantity) {
        int updatedRows =
                jdbc.sql(
                                """
                                UPDATE inventory
                                SET available = available - :quantity
                                WHERE product_id = :productId
                                  AND available >= :quantity
                                """)
                        .param("productId", productId)
                        .param("quantity", quantity)
                        .update();
        return updatedRows == 1;
    }
}

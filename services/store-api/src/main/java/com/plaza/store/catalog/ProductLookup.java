package com.plaza.store.catalog;

import java.util.Collection;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The door other modules (cart, ordering) use to read products: they ask for a few ids and get
 * name, price and stock back, without knowing the catalog tables.
 */
@Repository
public class ProductLookup {

    private final JdbcClient jdbc;

    public ProductLookup(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The products with these ids, in no particular order. Unknown ids are simply missing. */
    public List<ProductSnapshot> findByIds(Collection<Long> ids) {
        if (ids.isEmpty()) {
            // "IN ()" is not valid SQL, and there is nothing to look for anyway.
            return List.of();
        }
        // A collection parameter is expanded to one placeholder per element: IN (?, ?, ?).
        return jdbc.sql(
                        """
                        SELECT p.id, p.name, p.price, p.image_url,
                               COALESCE(i.available, 0) AS available
                        FROM product p
                        LEFT JOIN inventory i ON i.product_id = p.id
                        WHERE p.id IN (:ids)
                        """)
                .param("ids", ids)
                .query((row, rowNumber) ->
                        new ProductSnapshot(
                                row.getLong("id"),
                                row.getString("name"),
                                row.getBigDecimal("price"),
                                row.getString("image_url"),
                                row.getInt("available")))
                .list();
    }
}

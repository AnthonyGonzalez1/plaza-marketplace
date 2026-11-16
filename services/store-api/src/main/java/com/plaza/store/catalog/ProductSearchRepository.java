package com.plaza.store.catalog;

import com.plaza.store.catalog.ProductSummary.CategoryRef;
import com.plaza.store.catalog.ProductSummary.StoreRef;
import com.plaza.store.shared.PageParams;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Product search written in plain SQL (see ADR-0005 and docs/sql/catalog-search.md).
 *
 * <p>The SQL text is assembled only from fixed fragments of this class. Everything the client sends
 * travels as a named parameter (":q", ":storeId"...), which the database receives as data and never
 * executes as SQL.
 */
@Repository
public class ProductSearchRepository {

    private static final String SELECT_PRODUCTS =
            """
            SELECT p.id, p.name, p.slug, p.price, p.image_url,
                   COALESCE(i.available, 0) AS available,
                   s.id AS store_id, s.name AS store_name, s.slug AS store_slug,
                   c.id AS category_id, c.name AS category_name, c.slug AS category_slug
            FROM product p
            JOIN store s ON s.id = p.store_id
            JOIN category c ON c.id = p.category_id
            LEFT JOIN inventory i ON i.product_id = p.id
            """;

    // The filters only use columns of product, so counting does not need the joins.
    private static final String COUNT_PRODUCTS = "SELECT count(*) FROM product p";

    private final JdbcClient jdbc;

    public ProductSearchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** One page of the products that match the criteria, in the order the criteria asks for. */
    public List<ProductSummary> search(ProductSearchCriteria criteria, PageParams pageParams) {
        return jdbc.sql(searchSql(criteria))
                .params(searchParams(criteria, pageParams))
                .query(ProductSearchRepository::toProductSummary)
                .list();
    }

    /** How many products match the criteria in total, ignoring pagination. */
    public long count(ProductSearchCriteria criteria) {
        return jdbc.sql(COUNT_PRODUCTS + where(criteria))
                .params(filterParams(criteria))
                .query(Long.class)
                .single();
    }

    // Package-private so that the tests can run EXPLAIN on exactly the same statement.
    String searchSql(ProductSearchCriteria criteria) {
        return SELECT_PRODUCTS
                + where(criteria)
                + " ORDER BY "
                + criteria.sort().orderBy()
                + " LIMIT :limit OFFSET :offset";
    }

    Map<String, Object> searchParams(ProductSearchCriteria criteria, PageParams pageParams) {
        Map<String, Object> params = filterParams(criteria);
        params.put("limit", pageParams.size());
        params.put("offset", pageParams.offset());
        return params;
    }

    // Adds one condition per filter that is present. Keep in sync with filterParams below.
    private static String where(ProductSearchCriteria criteria) {
        List<String> conditions = new ArrayList<>();
        if (criteria.q() != null) {
            // @@ means "matches". websearch_to_tsquery understands what people type in a
            // search box: several words (all must appear), "quoted phrases" and -excluded.
            conditions.add("p.search_vector @@ websearch_to_tsquery('plaza_spanish', :q)");
        }
        if (criteria.storeId() != null) {
            conditions.add("p.store_id = :storeId");
        }
        if (criteria.categoryId() != null) {
            conditions.add("p.category_id = :categoryId");
        }
        if (criteria.minPrice() != null) {
            conditions.add("p.price >= :minPrice");
        }
        if (criteria.maxPrice() != null) {
            conditions.add("p.price <= :maxPrice");
        }
        return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
    }

    private static Map<String, Object> filterParams(ProductSearchCriteria criteria) {
        Map<String, Object> params = new HashMap<>();
        if (criteria.q() != null) {
            params.put("q", criteria.q());
        }
        if (criteria.storeId() != null) {
            params.put("storeId", criteria.storeId());
        }
        if (criteria.categoryId() != null) {
            params.put("categoryId", criteria.categoryId());
        }
        if (criteria.minPrice() != null) {
            params.put("minPrice", criteria.minPrice());
        }
        if (criteria.maxPrice() != null) {
            params.put("maxPrice", criteria.maxPrice());
        }
        return params;
    }

    private static ProductSummary toProductSummary(ResultSet row, int rowNumber)
            throws SQLException {
        return new ProductSummary(
                row.getLong("id"),
                row.getString("name"),
                row.getString("slug"),
                row.getBigDecimal("price"),
                CatalogMapper.CURRENCY,
                row.getString("image_url"),
                row.getInt("available"),
                new StoreRef(
                        row.getLong("store_id"),
                        row.getString("store_name"),
                        row.getString("store_slug")),
                new CategoryRef(
                        row.getLong("category_id"),
                        row.getString("category_name"),
                        row.getString("category_slug")));
    }
}

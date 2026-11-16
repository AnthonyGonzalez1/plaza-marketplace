package com.plaza.store.catalog;

import com.plaza.store.shared.InvalidRequestException;

/**
 * The allowed values of the {@code sort} query parameter, each with its SQL ORDER BY.
 *
 * <p>This enum is a whitelist: the ORDER BY text always comes from here, never from what the client
 * typed, so the sort cannot be used for SQL injection. Every ORDER BY ends with the unique id so
 * that products with the same price or date always come out in the same order; otherwise a product
 * could appear on two pages or on none.
 */
public enum ProductSort {
    // ts_rank scores how well the product matches the words in :q (name matches weigh more).
    RELEVANCE(
            "relevance",
            "ts_rank(p.search_vector, websearch_to_tsquery('plaza_spanish', :q)) DESC, p.id DESC"),
    PRICE_ASC("price_asc", "p.price ASC, p.id ASC"),
    PRICE_DESC("price_desc", "p.price DESC, p.id DESC"),
    NEWEST("newest", "p.created_at DESC, p.id DESC");

    private final String param;
    private final String orderBy;

    ProductSort(String param, String orderBy) {
        this.param = param;
        this.orderBy = orderBy;
    }

    public String orderBy() {
        return orderBy;
    }

    /** Converts the query parameter value into a sort, or fails with a 400 for unknown values. */
    public static ProductSort fromParam(String value) {
        for (ProductSort sort : values()) {
            if (sort.param.equals(value)) {
                return sort;
            }
        }
        throw new InvalidRequestException(
                "sort must be one of relevance, price_asc, price_desc, newest, but was '"
                        + value
                        + "'");
    }
}

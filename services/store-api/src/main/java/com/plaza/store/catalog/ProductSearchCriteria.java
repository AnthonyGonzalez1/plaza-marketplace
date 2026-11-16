package com.plaza.store.catalog;

import com.plaza.store.shared.InvalidRequestException;
import java.math.BigDecimal;

/**
 * The validated filters and sort of a product search. A null field means "do not filter by this".
 * Build it with {@link #of}, which applies the defaults and rejects invalid combinations.
 */
public record ProductSearchCriteria(
        String q,
        Long storeId,
        Long categoryId,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        ProductSort sort) {

    public static ProductSearchCriteria of(
            String q,
            Long storeId,
            Long categoryId,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            String sortParam) {
        // "?q=" or only spaces means the buyer did not search for anything.
        String text = (q == null || q.isBlank()) ? null : q.trim();

        if (minPrice != null && minPrice.signum() < 0) {
            throw new InvalidRequestException("minPrice must be 0 or greater, but was " + minPrice);
        }
        if (maxPrice != null && maxPrice.signum() < 0) {
            throw new InvalidRequestException("maxPrice must be 0 or greater, but was " + maxPrice);
        }
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0) {
            throw new InvalidRequestException(
                    "minPrice ("
                            + minPrice
                            + ") must not be greater than maxPrice ("
                            + maxPrice
                            + ")");
        }

        return new ProductSearchCriteria(
                text, storeId, categoryId, minPrice, maxPrice, chooseSort(sortParam, text));
    }

    private static ProductSort chooseSort(String sortParam, String text) {
        if (sortParam == null || sortParam.isBlank()) {
            return text == null ? ProductSort.NEWEST : ProductSort.RELEVANCE;
        }
        ProductSort sort = ProductSort.fromParam(sortParam);
        // Relevance needs search words to rank by. Without them, fall back to newest.
        if (sort == ProductSort.RELEVANCE && text == null) {
            return ProductSort.NEWEST;
        }
        return sort;
    }
}

package com.plaza.store.shared;

import java.util.List;

/** JSON envelope of every paginated endpoint: the items of one page plus the totals. */
public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {

    public static <T> PageResponse<T> of(List<T> items, PageParams pageParams, long totalItems) {
        // Round up: 57 items in pages of 20 are 3 pages.
        int totalPages = (int) Math.ceil((double) totalItems / pageParams.size());
        return new PageResponse<>(
                items, pageParams.page(), pageParams.size(), totalItems, totalPages);
    }
}

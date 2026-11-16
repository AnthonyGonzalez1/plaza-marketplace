package com.plaza.store.shared;

/**
 * The {@code page} and {@code size} query parameters of a paginated endpoint. Creating one with
 * invalid values throws {@link InvalidRequestException}, which becomes a 400 response.
 */
public record PageParams(int page, int size) {

    public static final int MAX_SIZE = 100;

    public PageParams {
        if (page < 0) {
            throw new InvalidRequestException("page must be 0 or greater, but was " + page);
        }
        if (size < 1 || size > MAX_SIZE) {
            throw new InvalidRequestException(
                    "size must be between 1 and " + MAX_SIZE + ", but was " + size);
        }
    }

    /** Number of rows to skip to reach this page (the SQL OFFSET). */
    public long offset() {
        return (long) page * size;
    }
}

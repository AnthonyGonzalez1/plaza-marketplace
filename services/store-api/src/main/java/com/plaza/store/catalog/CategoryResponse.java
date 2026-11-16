package com.plaza.store.catalog;

/** A category as returned by {@code GET /api/v1/categories}. */
public record CategoryResponse(Long id, String name, String slug) {}

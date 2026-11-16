package com.plaza.store.catalog;

/** A store as returned by {@code GET /api/v1/stores}. */
public record StoreResponse(Long id, String name, String slug, String description) {}

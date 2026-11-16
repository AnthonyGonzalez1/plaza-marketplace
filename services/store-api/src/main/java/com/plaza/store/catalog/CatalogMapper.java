package com.plaza.store.catalog;

import com.plaza.store.catalog.ProductSummary.StoreRef;

/** Converts JPA entities into the records returned by the API. Plain static methods, no magic. */
final class CatalogMapper {

    // The marketplace only sells in Colombian pesos for now.
    static final String CURRENCY = "COP";

    private CatalogMapper() {}

    // Categories, images and stock do not exist yet in the schema, so the contract fields
    // category, imageUrl and available are returned as null / 0 until they are added.
    static ProductSummary toSummary(Product product) {
        return new ProductSummary(
                product.getId(),
                product.getName(),
                product.getSlug(),
                product.getPrice(),
                CURRENCY,
                null,
                0,
                toStoreRef(product.getStore()),
                null);
    }

    static ProductDetail toDetail(Product product) {
        return new ProductDetail(
                product.getId(),
                product.getName(),
                product.getSlug(),
                product.getDescription(),
                product.getPrice(),
                CURRENCY,
                null,
                0,
                toStoreRef(product.getStore()),
                null);
    }

    static StoreResponse toStoreResponse(Store store) {
        return new StoreResponse(
                store.getId(), store.getName(), store.getSlug(), store.getDescription());
    }

    private static StoreRef toStoreRef(Store store) {
        return new StoreRef(store.getId(), store.getName(), store.getSlug());
    }
}

package com.plaza.store.catalog;

import com.plaza.store.catalog.ProductSummary.CategoryRef;
import com.plaza.store.catalog.ProductSummary.StoreRef;

/** Converts JPA entities into the records returned by the API. Plain static methods, no magic. */
final class CatalogMapper {

    // The marketplace only sells in Colombian pesos for now.
    static final String CURRENCY = "COP";

    private CatalogMapper() {}

    static ProductDetail toDetail(Product product, int available) {
        Store store = product.getStore();
        Category category = product.getCategory();
        return new ProductDetail(
                product.getId(),
                product.getName(),
                product.getSlug(),
                product.getDescription(),
                product.getPrice(),
                CURRENCY,
                product.getImageUrl(),
                available,
                new StoreRef(store.getId(), store.getName(), store.getSlug()),
                new CategoryRef(category.getId(), category.getName(), category.getSlug()));
    }

    static StoreResponse toStoreResponse(Store store) {
        return new StoreResponse(
                store.getId(), store.getName(), store.getSlug(), store.getDescription());
    }

    static CategoryResponse toCategoryResponse(Category category) {
        return new CategoryResponse(category.getId(), category.getName(), category.getSlug());
    }
}

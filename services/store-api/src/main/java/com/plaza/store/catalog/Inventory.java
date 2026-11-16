package com.plaza.store.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Units of a product that can still be sold. Maps the {@code inventory} table, whose primary key is
 * the product id. The catalog only reads it; the code that changes stock arrives with checkout.
 */
@Entity
@Table(name = "inventory")
public class Inventory {

    @Id
    @Column(name = "product_id")
    private Long productId;

    private int available;

    protected Inventory() {}

    public Long getProductId() {
        return productId;
    }

    public int getAvailable() {
        return available;
    }
}

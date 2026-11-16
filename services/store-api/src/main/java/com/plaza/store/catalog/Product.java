package com.plaza.store.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * Something a store sells. Maps the {@code product} table. The {@code search_vector} and {@code
 * created_at} columns are not mapped: the database fills them and only the search SQL uses them.
 */
@Entity
@Table(name = "product")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // LAZY: store and category are only loaded when a query asks for them (see ProductRepository).
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id")
    private Store store;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id")
    private Category category;

    private String name;
    private String slug;
    private String description;

    // BigDecimal, never double: money must not have rounding errors.
    private BigDecimal price;

    @Column(name = "image_url")
    private String imageUrl;

    // JPA needs a no-argument constructor to build the object from a row.
    protected Product() {}

    public Long getId() {
        return id;
    }

    public Store getStore() {
        return store;
    }

    public Category getCategory() {
        return category;
    }

    public String getName() {
        return name;
    }

    public String getSlug() {
        return slug;
    }

    public String getDescription() {
        return description;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public String getImageUrl() {
        return imageUrl;
    }
}

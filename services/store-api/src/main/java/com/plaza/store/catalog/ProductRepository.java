package com.plaza.store.catalog;

import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {

    // @EntityGraph makes this query load the product together with its store and category in one
    // SELECT with JOINs. Without it, reading product.getStore() later would need another query,
    // and would fail outside the transaction because open-in-view is off.
    @Override
    @EntityGraph(attributePaths = {"store", "category"})
    Optional<Product> findById(Long id);
}

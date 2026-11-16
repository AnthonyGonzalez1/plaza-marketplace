package com.plaza.store.catalog;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code @EntityGraph(attributePaths = "store")} makes each query load the product and its store
 * with one JOIN. Without it, reading the store of every product in a page would run one extra query
 * per product (the "N+1 queries" problem).
 */
public interface ProductRepository extends JpaRepository<Product, Long> {

    @Override
    @EntityGraph(attributePaths = "store")
    Page<Product> findAll(Pageable pageable);

    @EntityGraph(attributePaths = "store")
    Page<Product> findByStoreId(Long storeId, Pageable pageable);

    @Override
    @EntityGraph(attributePaths = "store")
    Optional<Product> findById(Long id);
}

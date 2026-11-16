package com.plaza.store.catalog;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<Store, Long> {

    // Spring Data builds the query from the method name: SELECT ... FROM store ORDER BY name.
    List<Store> findAllByOrderByNameAsc();
}

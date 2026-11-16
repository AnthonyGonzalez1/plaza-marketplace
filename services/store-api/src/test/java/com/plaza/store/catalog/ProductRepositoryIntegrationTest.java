package com.plaza.store.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.plaza.store.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;

/** Runs the repository queries against a real PostgreSQL loaded with the seed data. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class ProductRepositoryIntegrationTest {

    @Autowired private ProductRepository productRepository;
    @Autowired private StoreRepository storeRepository;

    @Test
    void findByStoreIdReturnsOnlyProductsOfThatStore() {
        Store store =
                storeRepository.findAllByOrderByNameAsc().stream()
                        .filter(s -> s.getSlug().equals("cafe-la-palma"))
                        .findFirst()
                        .orElseThrow();

        Page<Product> page =
                productRepository.findByStoreId(store.getId(), PageRequest.of(0, 3, Sort.by("id")));

        assertThat(page.getTotalElements()).isEqualTo(4);
        assertThat(page.getContent()).hasSize(3);
        assertThat(page.getContent())
                .allSatisfy(product ->
                        assertThat(product.getStore().getSlug()).isEqualTo("cafe-la-palma"));
    }

    @Test
    void storesAreOrderedByName() {
        assertThat(storeRepository.findAllByOrderByNameAsc())
                .extracting(Store::getName)
                .containsExactly("Café La Palma", "Dulces del Valle", "Tejidos Doña Rosa");
    }
}

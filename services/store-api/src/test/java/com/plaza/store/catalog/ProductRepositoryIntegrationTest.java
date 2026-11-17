package com.plaza.store.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.plaza.store.TestcontainersConfiguration;
import com.plaza.store.inventory.InventoryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Runs the JPA repositories against a real PostgreSQL loaded with the seed data. On purpose there
 * is no {@code @Transactional} here: the product is read after the repository call returned, as the
 * API does, so the test fails if store or category were not loaded by the query.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class ProductRepositoryIntegrationTest {

    @Autowired private ProductRepository productRepository;
    @Autowired private StoreRepository storeRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private InventoryRepository inventoryRepository;
    @Autowired private JdbcClient jdbc;

    @Test
    void findByIdLoadsStoreAndCategory() {
        long id = productId("zapato-casual-de-gamuza");

        Product product = productRepository.findById(id).orElseThrow();

        assertThat(product.getName()).isEqualTo("Zapato casual de gamuza");
        assertThat(product.getPrice()).isEqualByComparingTo("165000");
        assertThat(product.getStore().getSlug()).isEqualTo("calzado-el-caminante");
        assertThat(product.getCategory().getSlug()).isEqualTo("calzado");
    }

    @Test
    void findByIdOfUnknownProductIsEmpty() {
        assertThat(productRepository.findById(999_999L)).isEmpty();
    }

    @Test
    void inventoryIsFoundByProductId() {
        long id = productId("canasto-de-werregue-pequeno");

        assertThat(inventoryRepository.findById(id).orElseThrow().getAvailable()).isEqualTo(1);
    }

    @Test
    void storesAreOrderedByName() {
        assertThat(storeRepository.findAllByOrderByNameAsc())
                .extracting(Store::getName)
                .containsExactly(
                        "Café La Palma",
                        "Calzado El Caminante",
                        "Dulces del Valle",
                        "Tejidos Doña Rosa");
    }

    @Test
    void categoriesAreOrderedByName() {
        assertThat(categoryRepository.findAllByOrderByNameAsc())
                .extracting(Category::getSlug)
                .containsExactly(
                        "accesorios",
                        "cafe-y-bebidas",
                        "calzado",
                        "despensa",
                        "dulces-y-postres",
                        "hogar-y-cocina",
                        "ropa-y-tejidos");
    }

    private long productId(String slug) {
        return jdbc.sql("SELECT id FROM product WHERE slug = :slug")
                .param("slug", slug)
                .query(Long.class)
                .single();
    }
}

package com.plaza.store.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.plaza.store.TestcontainersConfiguration;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;

/**
 * Checks the schema itself with plain SQL: the migrations ran and the database rejects invalid rows
 * even if the Java code has a bug. Each test runs in a transaction that is rolled back.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class SchemaIntegrationTest {

    private static final String INSERT_PRODUCT =
            """
            INSERT INTO product (store_id, category_id, name, slug, description, price)
            VALUES (:storeId, (SELECT min(id) FROM category), :name, :slug, 'Producto de prueba',
                    :price)
            """;

    @Autowired private JdbcClient jdbc;

    @Test
    void migrationsCreateTablesAndSeedData() {
        int failedMigrations =
                jdbc.sql("SELECT count(*) FROM flyway_schema_history WHERE NOT success")
                        .query(Integer.class)
                        .single();

        assertThat(failedMigrations).isZero();
        assertThat(count("store")).isEqualTo(4);
        assertThat(count("category")).isEqualTo(7);
        assertThat(count("product")).isEqualTo(60);
        // Every product has its stock row.
        assertThat(count("inventory")).isEqualTo(60);
    }

    @Test
    void rejectsProductWithPriceZero() {
        assertThatThrownBy(() -> insertProduct(anyStoreId(), "Producto gratis", "gratis", 0))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_product_price_positive");
    }

    @Test
    void rejectsDuplicateSlugInTheSameStore() {
        long storeId = anyStoreId();
        insertProduct(storeId, "Café especial", "cafe-especial", 20000);

        assertThatThrownBy(() -> insertProduct(storeId, "Otro café", "cafe-especial", 25000))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("uq_product_store_slug");
    }

    @Test
    void rejectsProductOfUnknownStore() {
        assertThatThrownBy(() -> insertProduct(999_999, "Sin tienda", "sin-tienda", 1000))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_product_store");
    }

    @Test
    void rejectsProductWithoutCategory() {
        assertThatThrownBy(() ->
                        jdbc.sql(
                                        """
                                        INSERT INTO product (store_id, name, slug, description, price)
                                        VALUES (:storeId, 'Sin categoría', 'sin-categoria', 'x', 1000)
                                        """)
                                .param("storeId", anyStoreId())
                                .update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("category_id");
    }

    @Test
    void rejectsNegativeStock() {
        assertThatThrownBy(() ->
                        jdbc.sql(
                                        """
                                        UPDATE inventory SET available = -1
                                        WHERE product_id = (SELECT min(id) FROM product)
                                        """)
                                .update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_inventory_available_not_negative");
    }

    @Test
    void searchVectorIsGeneratedByTheDatabase() {
        insertProduct(anyStoreId(), "Lámparas de cerámica", "lamparas-de-ceramica", 50000);

        // Lowercased, without accents, reduced to the stem, and tagged with weight A (name).
        String searchVector =
                jdbc.sql(
                                "SELECT search_vector::text FROM product"
                                        + " WHERE slug = 'lamparas-de-ceramica'")
                        .query(String.class)
                        .single();

        assertThat(searchVector).contains("'lamp':1A").contains("'ceram':3A");
    }

    // Exercise S1 (docs/exercises/s1.md): add the migration that makes this test pass,
    // then remove @Disabled.
    @Disabled("Exercise S1: needs a CHECK constraint that rejects blank product names")
    @Test
    void rejectsProductWithBlankName() {
        assertThatThrownBy(() -> insertProduct(anyStoreId(), "   ", "nombre-en-blanco", 1000))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_product_name_not_blank");
    }

    private int count(String table) {
        // Only called with table names written in this class, never with user input.
        return jdbc.sql("SELECT count(*) FROM " + table).query(Integer.class).single();
    }

    private long anyStoreId() {
        return jdbc.sql("SELECT min(id) FROM store").query(Long.class).single();
    }

    private void insertProduct(long storeId, String name, String slug, int price) {
        jdbc.sql(INSERT_PRODUCT)
                .param("storeId", storeId)
                .param("name", name)
                .param("slug", slug)
                .param("price", price)
                .update();
    }
}

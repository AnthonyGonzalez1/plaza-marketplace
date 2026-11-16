package com.plaza.store.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.plaza.store.TestcontainersConfiguration;
import com.plaza.store.shared.PageParams;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;

/**
 * Asks PostgreSQL for the query plan (EXPLAIN) of the real search statement and checks that it uses
 * the GIN index.
 *
 * <p>With the 60 seed products PostgreSQL correctly ignores every index: the whole table fits in a
 * couple of pages, so reading it all is the cheapest plan. Forcing the planner with {@code SET
 * enable_seqscan = off} is not a fair check either (at this size it then walks the primary key
 * index instead of the GIN index). So the test makes the table big enough to matter: it inserts
 * 20,000 filler products, refreshes the statistics, and looks at the plan the planner chooses on
 * its own with default settings. Everything runs in one transaction that is rolled back, so the
 * other tests never see the filler rows.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class ProductSearchIndexIntegrationTest {

    @Autowired private ProductSearchRepository productSearchRepository;
    @Autowired private JdbcClient jdbc;

    @Test
    void searchUsesTheGinIndexOnALargeTable() {
        jdbc.sql(
                        """
                        INSERT INTO product (store_id, category_id, name, slug, description, price)
                        SELECT (SELECT min(id) FROM store),
                               (SELECT min(id) FROM category),
                               'Producto de relleno ' || n,
                               'relleno-' || n,
                               'Artículo generado para la prueba del índice número ' || n,
                               1000 + n
                        FROM generate_series(1, 20000) AS n
                        """)
                .update();
        // GIN does not index new rows one by one: it parks them in a "pending list" that
        // autovacuum merges into the index later. Right after a bulk insert that list is long
        // and makes the index look expensive, so merge it now, as autovacuum would.
        jdbc.sql("SELECT gin_clean_pending_list('idx_product_search_vector')")
                .query(Long.class)
                .single();
        jdbc.sql("ANALYZE product").update();

        ProductSearchCriteria criteria =
                ProductSearchCriteria.of("zapatos", null, null, null, null, null);
        PageParams pageParams = new PageParams(0, 20);

        // EXPLAIN goes in front of exactly the statement the repository runs.
        List<String> planLines =
                jdbc.sql("EXPLAIN " + productSearchRepository.searchSql(criteria))
                        .params(productSearchRepository.searchParams(criteria, pageParams))
                        .query(String.class)
                        .list();

        String plan = String.join("\n", planLines);
        assertThat(plan)
                .contains("Bitmap Index Scan on idx_product_search_vector")
                .doesNotContain("Seq Scan on product");
    }
}

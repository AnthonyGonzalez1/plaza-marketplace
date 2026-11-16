package com.plaza.store.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.plaza.store.TestcontainersConfiguration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Search, filters, sorting and validation of {@code GET /api/v1/products} against a real
 * PostgreSQL. The expected numbers come from the seed data of migrations V2 and V6.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ProductSearchApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcClient jdbc;

    // ---- Full-text search ----

    @Test
    void findsProductsByWord() throws Exception {
        mockMvc.perform(products().param("q", "ruana"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(1)))
                .andExpect(jsonPath("$.items[0].slug", is("ruana-de-lana-virgen")));
    }

    @Test
    void findsOtherFormsOfTheWordThroughSpanishStemming() throws Exception {
        // The buyer types the plural; the products say "Zapato" (singular) in the name.
        mockMvc.perform(products().param("q", "zapatos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(3)))
                .andExpect(
                        jsonPath(
                                "$.items[*].slug",
                                containsInAnyOrder(
                                        "zapato-formal-de-cuero-negro",
                                        "zapato-casual-de-gamuza",
                                        "betun-y-cepillo-para-calzado")));
    }

    @Test
    void searchIgnoresAccentsAndCase() throws Exception {
        List<Integer> withAccent = ids(products().param("q", "café").param("size", "100"));
        List<Integer> withoutAccent = ids(products().param("q", "cafe").param("size", "100"));
        List<Integer> upperCase = ids(products().param("q", "CAFE").param("size", "100"));

        assertThat(withAccent).isNotEmpty();
        assertThat(withoutAccent).isEqualTo(withAccent);
        assertThat(upperCase).isEqualTo(withAccent);
    }

    @Test
    void severalWordsMustAllMatch() throws Exception {
        mockMvc.perform(products().param("q", "cuero mujer"))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath(
                                "$.items[*].slug",
                                containsInAnyOrder(
                                        "botines-de-cuero-para-mujer",
                                        "sandalias-de-cuero-para-mujer")));
    }

    @Test
    void searchWithoutMatchesReturnsAnEmptyPage() throws Exception {
        mockMvc.perform(products().param("q", "paracaídas"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalItems", is(0)))
                .andExpect(jsonPath("$.totalPages", is(0)));
    }

    @Test
    void blankSearchTextListsEverything() throws Exception {
        mockMvc.perform(products().param("q", "  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(60)));
    }

    @Test
    void searchTextIsTreatedAsDataNotAsSql() throws Exception {
        mockMvc.perform(products().param("q", "'; DROP TABLE product; --"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(0)));

        mockMvc.perform(products()).andExpect(jsonPath("$.totalItems", is(60)));
    }

    // ---- Filters ----

    @Test
    void filtersByStore() throws Exception {
        mockMvc.perform(products().param("storeId", storeId("calzado-el-caminante")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(12)))
                .andExpect(
                        jsonPath("$.items[*].store.slug", everyItem(is("calzado-el-caminante"))));
    }

    @Test
    void filtersByCategory() throws Exception {
        mockMvc.perform(products().param("categoryId", categoryId("calzado")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(9)))
                .andExpect(jsonPath("$.items[*].category.slug", everyItem(is("calzado"))));
    }

    @Test
    void filtersByMinPrice() throws Exception {
        mockMvc.perform(products().param("minPrice", "200000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(4)))
                .andExpect(
                        jsonPath(
                                "$.items[*].slug",
                                containsInAnyOrder(
                                        "cobija-de-lana-matrimonial",
                                        "canasto-de-werregue-pequeno",
                                        "botas-de-cuero-para-trabajo",
                                        "bolso-carriel-antioqueno")));
    }

    @Test
    void filtersByMaxPrice() throws Exception {
        mockMvc.perform(products().param("maxPrice", "9000"))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath(
                                "$.items[*].slug",
                                containsInAnyOrder(
                                        "colador-de-tela-para-cafe",
                                        "gelatina-de-pata-x10",
                                        "achiras-del-huila-250g")));
    }

    @Test
    void priceRangeIncludesBothLimits() throws Exception {
        mockMvc.perform(products().param("minPrice", "10500").param("maxPrice", "12000"))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath(
                                "$.items[*].slug",
                                containsInAnyOrder(
                                        "panelitas-de-leche-x12",
                                        "chocolate-de-mesa-clavos-canela-500g",
                                        "cocadas-surtidas-x6",
                                        "manilla-tejida-en-hilo")));
    }

    @Test
    void combinesSearchWithFilters() throws Exception {
        // "cuero" appears in shoes and in accessories; keep only the accessories up to 100000.
        mockMvc.perform(
                        products()
                                .param("q", "cuero")
                                .param("storeId", storeId("calzado-el-caminante"))
                                .param("categoryId", categoryId("accesorios"))
                                .param("maxPrice", "100000"))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath(
                                "$.items[*].slug",
                                containsInAnyOrder(
                                        "cinturon-de-cuero-trenzado",
                                        "billetera-de-cuero-para-hombre")));
    }

    @Test
    void unknownStoreReturnsAnEmptyPage() throws Exception {
        mockMvc.perform(products().param("storeId", "999999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(0)));
    }

    // ---- Sorting ----

    @Test
    void sortsByPriceAscending() throws Exception {
        List<Double> prices = prices(products().param("sort", "price_asc").param("size", "100"));

        assertThat(prices).hasSize(60).isSorted();
        assertThat(prices.getFirst()).isEqualTo(7500.0);
    }

    @Test
    void sortsByPriceDescending() throws Exception {
        List<Double> prices = prices(products().param("sort", "price_desc").param("size", "100"));

        assertThat(prices).hasSize(60).isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(prices.getFirst()).isEqualTo(240000.0);
    }

    @Test
    void sortsByNewestByDefault() throws Exception {
        List<Integer> expected =
                jdbc.sql("SELECT id FROM product ORDER BY created_at DESC, id DESC LIMIT 20")
                        .query(Integer.class)
                        .list();

        assertThat(ids(products())).isEqualTo(expected);
        assertThat(ids(products().param("sort", "newest"))).isEqualTo(expected);
        // Asking for relevance without search words has nothing to rank: same as newest.
        assertThat(ids(products().param("sort", "relevance"))).isEqualTo(expected);
    }

    @Test
    void sortsByRelevanceWhenSearching() throws Exception {
        // "Zapato" in the name (weight A) ranks above "zapatos" only in the description (B).
        mockMvc.perform(products().param("q", "zapato"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].name", startsWith("Zapato")))
                .andExpect(jsonPath("$.items[1].name", startsWith("Zapato")))
                .andExpect(jsonPath("$.items[2].slug", is("betun-y-cepillo-para-calzado")));
    }

    @Test
    void explicitSortOverridesRelevance() throws Exception {
        List<Double> prices = prices(products().param("q", "cuero").param("sort", "price_asc"));

        assertThat(prices).isNotEmpty().isSorted();
    }

    // ---- Pagination ----

    @Test
    void pagesDoNotRepeatOrSkipProducts() throws Exception {
        // price_asc has many equal prices: without the id tie-break this test would be flaky.
        List<Integer> seen = new ArrayList<>();
        for (int page = 0; page < 4; page++) {
            seen.addAll(
                    ids(
                            products()
                                    .param("sort", "price_asc")
                                    .param("size", "17")
                                    .param("page", String.valueOf(page))));
        }

        assertThat(seen).hasSize(60);
        assertThat(new HashSet<>(seen)).hasSize(60);
    }

    @Test
    void acceptsTheSmallestAndLargestPageSize() throws Exception {
        mockMvc.perform(products().param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.totalPages", is(60)));
        mockMvc.perform(products().param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(60)))
                .andExpect(jsonPath("$.totalPages", is(1)));
    }

    @Test
    void lastPageOfASearchHasTheRemainingItems() throws Exception {
        mockMvc.perform(products().param("q", "zapatos").param("size", "2").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.totalItems", is(3)))
                .andExpect(jsonPath("$.totalPages", is(2)));
    }

    // ---- Validation ----

    @Test
    void sizeZeroReturns400() throws Exception {
        expectBadRequest(products().param("size", "0"), "size must be between 1 and 100");
    }

    @Test
    void unknownSortReturns400() throws Exception {
        expectBadRequest(
                products().param("sort", "cheapest"),
                "sort must be one of relevance, price_asc, price_desc, newest");
    }

    @Test
    void minPriceGreaterThanMaxPriceReturns400() throws Exception {
        expectBadRequest(
                products().param("minPrice", "50000").param("maxPrice", "10000"),
                "minPrice (50000) must not be greater than maxPrice (10000)");
    }

    @Test
    void negativePriceReturns400() throws Exception {
        expectBadRequest(products().param("minPrice", "-1"), "minPrice must be 0 or greater");
    }

    @Test
    void nonNumericFilterReturns400() throws Exception {
        mockMvc.perform(products().param("minPrice", "barato"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));
        mockMvc.perform(products().param("storeId", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));
    }

    // ---- Helpers ----

    private static MockHttpServletRequestBuilder products() {
        return get("/api/v1/products");
    }

    private void expectBadRequest(MockHttpServletRequestBuilder request, String detailStart)
            throws Exception {
        mockMvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status", is(400)))
                .andExpect(jsonPath("$.title", is("Bad Request")))
                .andExpect(jsonPath("$.detail", startsWith(detailStart)));
    }

    private List<Integer> ids(MockHttpServletRequestBuilder request) throws Exception {
        return JsonPath.read(body(request), "$.items[*].id");
    }

    private List<Double> prices(MockHttpServletRequestBuilder request) throws Exception {
        return JsonPath.read(body(request), "$.items[*].price");
    }

    private String body(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request)
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    private String storeId(String slug) {
        return jdbc.sql("SELECT id FROM store WHERE slug = :slug")
                .param("slug", slug)
                .query(String.class)
                .single();
    }

    private String categoryId(String slug) {
        return jdbc.sql("SELECT id FROM category WHERE slug = :slug")
                .param("slug", slug)
                .query(String.class)
                .single();
    }
}

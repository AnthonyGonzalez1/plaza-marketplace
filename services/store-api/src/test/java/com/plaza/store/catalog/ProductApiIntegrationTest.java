package com.plaza.store.catalog;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plaza.store.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Calls the HTTP endpoints through the whole application (controller, service, repository) with a
 * real PostgreSQL. MockMvc sends the requests without opening a network port.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ProductApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcClient jdbc;

    @Test
    void listsProductsWithDefaultPagination() throws Exception {
        mockMvc.perform(get("/api/v1/products"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.items", hasSize(12)))
                .andExpect(jsonPath("$.page", is(0)))
                .andExpect(jsonPath("$.size", is(20)))
                .andExpect(jsonPath("$.totalItems", is(12)))
                .andExpect(jsonPath("$.totalPages", is(1)));
    }

    @Test
    void returnsTheRequestedPage() throws Exception {
        // 12 products in pages of 5: page 2 is the last one and has 2 items.
        mockMvc.perform(get("/api/v1/products").param("page", "2").param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.page", is(2)))
                .andExpect(jsonPath("$.size", is(5)))
                .andExpect(jsonPath("$.totalItems", is(12)))
                .andExpect(jsonPath("$.totalPages", is(3)));
    }

    @Test
    void pageAfterTheLastOneIsEmpty() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("page", "9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalItems", is(12)));
    }

    @Test
    void productHasTheContractShape() throws Exception {
        long id = productId("cafe-molido-quindio-500g");

        mockMvc.perform(get("/api/v1/products/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is((int) id)))
                .andExpect(jsonPath("$.name", is("Café molido Quindío 500 g")))
                .andExpect(jsonPath("$.slug", is("cafe-molido-quindio-500g")))
                .andExpect(jsonPath("$.description").isNotEmpty())
                .andExpect(jsonPath("$.price", is(32000.00)))
                .andExpect(jsonPath("$.currency", is("COP")))
                .andExpect(jsonPath("$.imageUrl", nullValue()))
                .andExpect(jsonPath("$.available", is(0)))
                .andExpect(jsonPath("$.store.name", is("Café La Palma")))
                .andExpect(jsonPath("$.store.slug", is("cafe-la-palma")))
                .andExpect(jsonPath("$.category", nullValue()));
    }

    @Test
    void filtersByStore() throws Exception {
        long storeId =
                jdbc.sql("SELECT id FROM store WHERE slug = 'dulces-del-valle'")
                        .query(Long.class)
                        .single();

        mockMvc.perform(get("/api/v1/products").param("storeId", String.valueOf(storeId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems", is(4)))
                .andExpect(jsonPath("$.items[*].store.slug", everyItem(is("dulces-del-valle"))));
    }

    @Test
    void unknownProductReturns404ProblemDetail() throws Exception {
        mockMvc.perform(get("/api/v1/products/999999"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status", is(404)))
                .andExpect(jsonPath("$.title", is("Not Found")))
                .andExpect(jsonPath("$.detail", is("Product 999999 not found")));
    }

    @Test
    void negativePageReturns400ProblemDetail() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status", is(400)))
                .andExpect(jsonPath("$.detail", is("page must be 0 or greater, but was -1")));
    }

    @Test
    void nonNumericPageReturns400ProblemDetail() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("page", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));
    }

    // Exercise S1 (docs/exercises/s1.md): add a test here that asks for size=101
    // and expects a 400 problem detail.

    @Test
    void listsStores() throws Exception {
        mockMvc.perform(get("/api/v1/stores"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].name", is("Café La Palma")))
                .andExpect(jsonPath("$[0].slug", is("cafe-la-palma")))
                .andExpect(jsonPath("$[0].description").isNotEmpty());
    }

    @Test
    void allowsTheConfiguredWebOrigin() throws Exception {
        mockMvc.perform(get("/api/v1/stores").header("Origin", "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }

    @Test
    void publishesTheOpenApiSpec() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/products']").exists());
    }

    private long productId(String slug) {
        return jdbc.sql("SELECT id FROM product WHERE slug = :slug")
                .param("slug", slug)
                .query(Long.class)
                .single();
    }
}

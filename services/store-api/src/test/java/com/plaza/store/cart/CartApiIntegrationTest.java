package com.plaza.store.cart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.plaza.store.TestcontainersConfiguration;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** The cart endpoints through the whole application, with a real Redis and a real PostgreSQL. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CartApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcClient jdbc;
    @Autowired private StringRedisTemplate redis;

    @Test
    void newCartIsEmpty() throws Exception {
        mockMvc.perform(post("/api/v1/carts"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalItems", is(0)))
                .andExpect(jsonPath("$.total", is(0)))
                .andExpect(jsonPath("$.currency", is("COP")));
    }

    @Test
    void addsProductsAndComputesTotalsWithCatalogPrices() throws Exception {
        String cartId = createCart();
        // Seed data: coffee costs 32000 (20 in stock), the basket 230000 (1 in stock).
        long coffee = productId("cafe-molido-quindio-500g");
        long basket = productId("canasto-de-werregue-pequeno");

        setQuantity(cartId, coffee, 2).andExpect(status().isOk());
        setQuantity(cartId, basket, 1)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.totalItems", is(3)))
                .andExpect(jsonPath("$.total", is(294000.00)));

        mockMvc.perform(get("/api/v1/carts/{id}", cartId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(cartId)))
                .andExpect(
                        jsonPath("$.items[?(@.productId == %d)].name".formatted(coffee))
                                .value("Café molido Quindío 500 g"))
                .andExpect(
                        jsonPath("$.items[?(@.productId == %d)].unitPrice".formatted(coffee))
                                .value(32000.00))
                .andExpect(
                        jsonPath("$.items[?(@.productId == %d)].quantity".formatted(coffee))
                                .value(2))
                .andExpect(
                        jsonPath("$.items[?(@.productId == %d)].available".formatted(coffee))
                                .value(20))
                .andExpect(
                        jsonPath("$.items[?(@.productId == %d)].lineTotal".formatted(coffee))
                                .value(64000.00));
    }

    @Test
    void settingTheQuantityTwiceLeavesTheSameCart() throws Exception {
        String cartId = createCart();
        long coffee = productId("cafe-molido-quindio-500g");

        // PUT sets the quantity; it does not add to it. Repeating the request changes nothing.
        setQuantity(cartId, coffee, 3).andExpect(jsonPath("$.totalItems", is(3)));
        setQuantity(cartId, coffee, 3)
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.totalItems", is(3)));
    }

    @Test
    void removesAProductAndKeepsTheEmptyCart() throws Exception {
        String cartId = createCart();
        long coffee = productId("cafe-molido-quindio-500g");
        setQuantity(cartId, coffee, 1);

        mockMvc.perform(delete("/api/v1/carts/{id}/items/{productId}", cartId, coffee))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));

        // The cart survives without items.
        mockMvc.perform(get("/api/v1/carts/{id}", cartId)).andExpect(status().isOk());
    }

    @Test
    void cartExpiresAfterInactivity() throws Exception {
        String cartId = createCart();

        // Redis reports the remaining life of the key: 7 days by default.
        Long secondsToLive = redis.getExpire("cart:" + cartId, TimeUnit.SECONDS);
        assertThat(secondsToLive).isBetween(6 * 24 * 3600L, 7 * 24 * 3600L);
    }

    @Test
    void unknownCartReturns404ProblemDetail() throws Exception {
        UUID unknown = UUID.randomUUID();
        mockMvc.perform(get("/api/v1/carts/{id}", unknown))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail", is("Cart " + unknown + " not found or expired")));
    }

    @Test
    void cartIdThatIsNotAUuidReturns400() throws Exception {
        mockMvc.perform(get("/api/v1/carts/not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));
    }

    @Test
    void unknownProductReturns404() throws Exception {
        setQuantity(createCart(), 999999, 1)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail", is("Product 999999 not found")));
    }

    @Test
    void quantityOutsideTheAllowedRangeReturns400() throws Exception {
        String cartId = createCart();
        long coffee = productId("cafe-molido-quindio-500g");

        setQuantity(cartId, coffee, 0)
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));
        setQuantity(cartId, coffee, 100).andExpect(status().isBadRequest());
    }

    private String createCart() throws Exception {
        String body =
                mockMvc.perform(post("/api/v1/carts"))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private ResultActions setQuantity(String cartId, long productId, int quantity)
            throws Exception {
        return mockMvc.perform(
                put("/api/v1/carts/{id}/items/{productId}", cartId, productId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\": " + quantity + "}"));
    }

    private long productId(String slug) {
        return jdbc.sql("SELECT id FROM product WHERE slug = :slug")
                .param("slug", slug)
                .query(Long.class)
                .single();
    }
}

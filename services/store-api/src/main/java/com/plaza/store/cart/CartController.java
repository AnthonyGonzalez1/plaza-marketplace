package com.plaza.store.cart;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Buyers have no account yet: whoever knows the cart id (a random UUID kept by the browser) owns
 * the cart.
 */
@RestController
@RequestMapping("/api/v1/carts")
@Tag(name = "Carts")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an empty cart")
    public CartResponse createCart() {
        return cartService.createCart();
    }

    @GetMapping("/{cartId}")
    @Operation(summary = "Get a cart with current prices and stock")
    public CartResponse getCart(@PathVariable UUID cartId) {
        return cartService.getCart(cartId);
    }

    // PUT, not POST: the body carries the final quantity ("set it to 3"), not a change ("add
    // 1"). Sending the same request twice leaves the cart the same, so a retry after a network
    // error is safe. That property is called idempotency.
    @PutMapping("/{cartId}/items/{productId}")
    @Operation(summary = "Set the quantity of a product in the cart (adds it if missing)")
    public CartResponse setQuantity(
            @PathVariable UUID cartId,
            @PathVariable long productId,
            @Valid @RequestBody SetQuantityRequest request) {
        return cartService.setQuantity(cartId, productId, request.quantity());
    }

    @DeleteMapping("/{cartId}/items/{productId}")
    @Operation(summary = "Remove a product from the cart")
    public CartResponse removeItem(@PathVariable UUID cartId, @PathVariable long productId) {
        return cartService.removeItem(cartId, productId);
    }
}

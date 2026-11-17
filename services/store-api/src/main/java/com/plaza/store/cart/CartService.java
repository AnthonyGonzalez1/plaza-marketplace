package com.plaza.store.cart;

import com.plaza.store.cart.CartResponse.CartItemResponse;
import com.plaza.store.catalog.ProductLookup;
import com.plaza.store.catalog.ProductSnapshot;
import com.plaza.store.shared.NotFoundException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Shopping cart rules. Redis stores only "product id -> quantity"; names and prices are read from
 * the catalog every time, so a cart never shows a stale price.
 */
@Service
public class CartService {

    private static final String CURRENCY = "COP";

    private final CartRepository cartRepository;
    private final ProductLookup productLookup;

    public CartService(CartRepository cartRepository, ProductLookup productLookup) {
        this.cartRepository = cartRepository;
        this.productLookup = productLookup;
    }

    public CartResponse createCart() {
        return getCart(cartRepository.create());
    }

    public CartResponse getCart(UUID cartId) {
        requireCart(cartId);
        return toResponse(cartId, cartRepository.findItems(cartId));
    }

    public CartResponse setQuantity(UUID cartId, long productId, int quantity) {
        requireCart(cartId);
        if (productLookup.findByIds(Set.of(productId)).isEmpty()) {
            throw new NotFoundException("Product " + productId + " not found");
        }
        cartRepository.setQuantity(cartId, productId, quantity);
        return getCart(cartId);
    }

    public CartResponse removeItem(UUID cartId, long productId) {
        requireCart(cartId);
        cartRepository.removeItem(cartId, productId);
        return getCart(cartId);
    }

    /** For checkout: product id -> quantity. Empty if the cart does not exist or has no items. */
    public Map<Long, Integer> findItems(UUID cartId) {
        return cartRepository.findItems(cartId);
    }

    /** For checkout: the cart has become an order and is no longer needed. */
    public void deleteCart(UUID cartId) {
        cartRepository.delete(cartId);
    }

    private void requireCart(UUID cartId) {
        if (!cartRepository.exists(cartId)) {
            throw new NotFoundException("Cart " + cartId + " not found or expired");
        }
    }

    private CartResponse toResponse(UUID cartId, Map<Long, Integer> quantities) {
        Map<Long, ProductSnapshot> products =
                productLookup.findByIds(quantities.keySet()).stream()
                        .collect(Collectors.toMap(ProductSnapshot::id, Function.identity()));

        List<CartItemResponse> items = new ArrayList<>();
        int totalItems = 0;
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<Long, Integer> entry : quantities.entrySet()) {
            ProductSnapshot product = products.get(entry.getKey());
            if (product == null) {
                // The product was removed from the catalog after it was added to the cart.
                continue;
            }
            int quantity = entry.getValue();
            BigDecimal lineTotal = product.price().multiply(BigDecimal.valueOf(quantity));
            items.add(
                    new CartItemResponse(
                            product.id(),
                            product.name(),
                            product.imageUrl(),
                            product.price(),
                            quantity,
                            product.available(),
                            lineTotal));
            totalItems += quantity;
            total = total.add(lineTotal);
        }
        return new CartResponse(cartId, items, totalItems, total, CURRENCY);
    }
}

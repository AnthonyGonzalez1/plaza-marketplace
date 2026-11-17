package com.plaza.store.ordering;

import com.plaza.store.cart.CartService;
import com.plaza.store.shared.InvalidRequestException;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/**
 * Turns a cart into an order. This class is deliberately NOT transactional: it talks to two systems
 * (Redis for the cart, PostgreSQL for the order) and a database transaction cannot cover Redis. The
 * order is committed first by {@link OrderService#placeOrder}; only then is the cart deleted. If
 * that last step fails, the buyer keeps a cart of things already bought, which is harmless; the
 * opposite order could lose a cart without creating the order.
 */
@Service
public class CheckoutService {

    private final CartService cartService;
    private final OrderService orderService;

    public CheckoutService(CartService cartService, OrderService orderService) {
        this.cartService = cartService;
        this.orderService = orderService;
    }

    /**
     * @param idempotencyKey identifies this checkout attempt (header {@code Idempotency-Key}), or
     *     null. A browser cannot know whether a request that timed out was processed, so it sends
     *     it again with the same key; the answer is then the order created the first time.
     */
    public OrderResponse checkout(UUID cartId, String email, String idempotencyKey) {
        if (idempotencyKey != null) {
            // A retry of a checkout that already succeeded. This check goes before the cart
            // check: the first attempt deleted the cart.
            Optional<OrderResponse> existing = orderService.findByIdempotencyKey(idempotencyKey);
            if (existing.isPresent()) {
                return existing.get();
            }
        }

        Map<Long, Integer> quantities = cartService.findItems(cartId);
        if (quantities.isEmpty()) {
            throw new InvalidRequestException("Cart " + cartId + " is empty or does not exist");
        }

        OrderResponse order;
        try {
            order = orderService.placeOrder(email, quantities, idempotencyKey);
        } catch (DuplicateKeyException sameKeyAtTheSameTime) {
            // Two requests with the same key ran in parallel and both passed the check above.
            // The UNIQUE constraint let only one insert its order; the transaction of this one
            // was rolled back, stock included. Answer with the order of the winner.
            return orderService.findByIdempotencyKey(idempotencyKey).orElseThrow();
        }
        cartService.deleteCart(cartId);
        return order;
    }
}

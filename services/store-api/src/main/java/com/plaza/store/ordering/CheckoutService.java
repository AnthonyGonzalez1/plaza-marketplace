package com.plaza.store.ordering;

import com.plaza.store.cart.CartService;
import com.plaza.store.shared.InvalidRequestException;
import java.util.Map;
import java.util.UUID;
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

    public OrderResponse checkout(UUID cartId, String email) {
        Map<Long, Integer> quantities = cartService.findItems(cartId);
        if (quantities.isEmpty()) {
            throw new InvalidRequestException("Cart " + cartId + " is empty or does not exist");
        }
        OrderResponse order = orderService.placeOrder(email, quantities);
        cartService.deleteCart(cartId);
        return order;
    }
}

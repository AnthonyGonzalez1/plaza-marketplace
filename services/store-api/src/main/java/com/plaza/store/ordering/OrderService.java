package com.plaza.store.ordering;

import com.plaza.store.catalog.ProductLookup;
import com.plaza.store.catalog.ProductSnapshot;
import com.plaza.store.inventory.StockRepository;
import com.plaza.store.shared.ConflictException;
import com.plaza.store.shared.InvalidRequestException;
import com.plaza.store.shared.NotFoundException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

    private final ProductLookup productLookup;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final Duration paymentWindow;

    public OrderService(
            ProductLookup productLookup,
            StockRepository stockRepository,
            OrderRepository orderRepository,
            @Value("${plaza.orders.payment-window}") Duration paymentWindow) {
        this.productLookup = productLookup;
        this.stockRepository = stockRepository;
        this.orderRepository = orderRepository;
        this.paymentWindow = paymentWindow;
    }

    /**
     * Reserves the stock and creates the order, all or nothing.
     *
     * <p>{@code @Transactional}: every statement below runs in one database transaction. If any
     * step throws (the third product has no stock, an insert fails), the transaction is rolled back
     * and the units already taken from the first two products return by themselves. There is never
     * an order without its stock, nor stock taken without an order.
     *
     * @param quantities product id -> units to buy
     */
    @Transactional
    public OrderResponse placeOrder(String email, Map<Long, Integer> quantities) {
        Map<Long, ProductSnapshot> products =
                productLookup.findByIds(quantities.keySet()).stream()
                        .collect(Collectors.toMap(ProductSnapshot::id, Function.identity()));

        // Always reserve in ascending product id. Two orders that contain the same two products
        // then lock their inventory rows in the same order. Without this, order A could lock
        // product 1 and wait for product 2 while order B holds 2 and waits for 1: a deadlock.
        Map<Long, Integer> sortedQuantities = new TreeMap<>(quantities);

        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<Long, Integer> entry : sortedQuantities.entrySet()) {
            long productId = entry.getKey();
            int quantity = entry.getValue();
            ProductSnapshot product = products.get(productId);
            if (product == null) {
                throw new InvalidRequestException("Product " + productId + " no longer exists");
            }
            if (!stockRepository.reserve(productId, quantity)) {
                throw new ConflictException(
                        "Not enough stock for product " + productId,
                        Map.of("productId", productId));
            }
            total = total.add(product.price().multiply(BigDecimal.valueOf(quantity)));
        }

        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plus(paymentWindow);
        UUID orderId = orderRepository.insertOrder(email, total, expiresAt);
        for (Map.Entry<Long, Integer> entry : sortedQuantities.entrySet()) {
            ProductSnapshot product = products.get(entry.getKey());
            // Name and price are copied into the order: later catalog changes must not alter it.
            orderRepository.insertItem(
                    orderId, product.id(), product.name(), product.price(), entry.getValue());
        }
        return orderRepository.findById(orderId).orElseThrow();
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrder(UUID orderId) {
        return orderRepository
                .findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order " + orderId + " not found"));
    }
}

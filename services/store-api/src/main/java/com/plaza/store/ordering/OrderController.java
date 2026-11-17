package com.plaza.store.ordering;

import com.plaza.store.shared.InvalidRequestException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
@Tag(name = "Orders")
public class OrderController {

    private final CheckoutService checkoutService;
    private final OrderService orderService;

    public OrderController(CheckoutService checkoutService, OrderService orderService) {
        this.checkoutService = checkoutService;
        this.orderService = orderService;
    }

    @PostMapping
    @Operation(
            summary = "Check out a cart: reserve the stock and create an order awaiting payment",
            description = "Returns 409 if any product no longer has enough stock.")
    public ResponseEntity<OrderResponse> placeOrder(
            @Parameter(
                            description =
                                    "Any unique text (a UUID) for this checkout attempt. Repeating"
                                            + " the request with the same key returns the same"
                                            + " order instead of creating another.")
                    @RequestHeader(value = "Idempotency-Key", required = false)
                    String idempotencyKey,
            @Valid @RequestBody PlaceOrderRequest request) {
        if (idempotencyKey != null && (idempotencyKey.isBlank() || idempotencyKey.length() > 100)) {
            throw new InvalidRequestException("Idempotency-Key must have 1 to 100 characters");
        }
        OrderResponse order =
                checkoutService.checkout(request.cartId(), request.email(), idempotencyKey);
        // 201 Created plus a Location header with the URL of the new resource.
        return ResponseEntity.created(URI.create("/api/v1/orders/" + order.id())).body(order);
    }

    @GetMapping("/{orderId}")
    @Operation(summary = "Get one order by id")
    public OrderResponse getOrder(@PathVariable UUID orderId) {
        return orderService.getOrder(orderId);
    }
}

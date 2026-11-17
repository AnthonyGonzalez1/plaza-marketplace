package com.plaza.store.cart;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Body of "set the quantity of a product in the cart". To remove a product, use DELETE. */
public record SetQuantityRequest(@NotNull @Min(1) @Max(99) Integer quantity) {}

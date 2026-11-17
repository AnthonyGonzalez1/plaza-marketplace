package com.plaza.store.ordering;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Guest checkout: the buyer has no account, only a cart and an email for the receipt. */
public record PlaceOrderRequest(
        @NotNull UUID cartId, @NotBlank @Email @Size(max = 254) String email) {}

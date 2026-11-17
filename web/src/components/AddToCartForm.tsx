import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { MAX_QUANTITY } from '../api/cart';
import { es } from '../i18n/es';
import { errorMessage } from '../lib/errorMessage';
import { useCart, useSetItemQuantity } from '../lib/useCart';

interface AddToCartFormProps {
  productId: number;
  /** Units in stock: the upper limit of the quantity field. */
  available: number;
}

/** Quantity field plus the "add to cart" button of the product page. */
export function AddToCartForm({ productId, available }: AddToCartFormProps) {
  const { cart, isLoading } = useCart();
  const setItemQuantity = useSetItemQuantity();
  // Kept as text while the user types (the field may be empty for a moment).
  const [quantityText, setQuantityText] = useState('1');

  const maxQuantity = Math.min(available, MAX_QUANTITY);
  const line = cart?.items.find((item) => item.productId === productId);
  const quantityInCart = line?.quantity ?? 0;

  const soldOut = available === 0;
  const cartHasMax = !soldOut && quantityInCart >= maxQuantity;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Anything that is not a whole number from 1 to the maximum is corrected, not rejected.
    let chosen = Number(quantityText);
    if (!Number.isInteger(chosen) || chosen < 1) {
      chosen = 1;
    }
    chosen = Math.min(chosen, maxQuantity);
    setQuantityText(String(chosen));

    // The API sets the absolute quantity, so "add 2" means "what the cart has now + 2".
    // Never ask for more than the stock (or the limit of 99 units per product).
    const newQuantity = Math.min(quantityInCart + chosen, maxQuantity);
    setItemQuantity.mutate({ productId, quantity: newQuantity });
  }

  // Text that explains why the button is disabled, if it is.
  let hint: string | null = null;
  if (soldOut) {
    hint = es.product.soldOutHint;
  } else if (cartHasMax) {
    hint = es.product.maxInCartHint;
  }

  // After a successful request the mutation holds the updated cart sent by the API.
  const addedLine = setItemQuantity.data?.items.find((item) => item.productId === productId);

  return (
    <form className="product-detail__buy" onSubmit={handleSubmit} noValidate>
      <div className="field add-to-cart__quantity">
        <label htmlFor="add-quantity">{es.product.quantityLabel}</label>
        <input
          id="add-quantity"
          className="input"
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(maxQuantity, 1)}
          value={quantityText}
          onChange={(event) => setQuantityText(event.target.value)}
          disabled={soldOut}
        />
      </div>

      <button
        className="button button--primary button--large"
        type="submit"
        // Wait for the cart: the new quantity depends on what the cart already has.
        disabled={soldOut || cartHasMax || isLoading || setItemQuantity.isPending}
        aria-describedby={hint ? 'cart-hint' : undefined}
      >
        {setItemQuantity.isPending ? es.product.adding : es.product.addToCart}
      </button>

      {hint && (
        <p id="cart-hint" className="product-detail__hint">
          {hint}
        </p>
      )}

      {/* A live region must already be on the page when its text changes; that is why this
          paragraph is always rendered, even empty. Screen readers announce the new text. */}
      <p className="add-to-cart__confirmation" role="status" aria-live="polite">
        {setItemQuantity.isSuccess && addedLine && (
          <>
            {es.product.addedToCart(addedLine.quantity)}{' '}
            <Link className="link" to="/cart">
              {es.product.viewCart}
            </Link>
          </>
        )}
      </p>

      {setItemQuantity.isError && (
        <p className="form-error" role="alert">
          {errorMessage(setItemQuantity.error)}
        </p>
      )}
    </form>
  );
}

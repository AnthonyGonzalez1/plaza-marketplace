import { Link } from 'react-router';
import { MAX_QUANTITY, type CartItem } from '../api/cart';
import { EmptyCart } from '../components/EmptyCart';
import { ProductImage } from '../components/ProductImage';
import { StatusMessage } from '../components/StatusMessage';
import { es } from '../i18n/es';
import { errorMessage } from '../lib/errorMessage';
import { formatPrice } from '../lib/format';
import { useCart, useRemoveItem, useSetItemQuantity } from '../lib/useCart';

export function CartPage() {
  const { cart, isLoading, isError, error, refetch } = useCart();
  const setItemQuantity = useSetItemQuantity();
  const removeItem = useRemoveItem();

  if (isLoading) {
    return (
      <p className="loading-text" role="status">
        {es.cart.loading}
      </p>
    );
  }

  if (isError) {
    return (
      <StatusMessage title={es.errors.title} hint={errorMessage(error)} heading="h1" role="alert">
        <button className="button button--primary" type="button" onClick={() => refetch()}>
          {es.errors.retry}
        </button>
      </StatusMessage>
    );
  }

  // No cart yet, an expired cart and a cart without products all look the same to the user.
  if (cart === null || cart.items.length === 0) {
    return (
      <>
        <title>{`${es.cart.title} · ${es.brand}`}</title>
        <EmptyCart />
      </>
    );
  }

  // One request at a time: the buttons are disabled while a change is being saved.
  const saving = setItemQuantity.isPending || removeItem.isPending;
  const changeError = setItemQuantity.error ?? removeItem.error;
  // The order would be rejected (409) while a line asks for more units than the stock.
  const hasStockProblem = cart.items.some((item) => item.quantity > item.available);

  return (
    <>
      <title>{`${es.cart.title} · ${es.brand}`}</title>
      <header className="page-header">
        <h1>{es.cart.title}</h1>
      </header>

      <ul className="cart-lines" aria-label={es.cart.listLabel}>
        {cart.items.map((item) => (
          <CartLine
            key={item.productId}
            item={item}
            disabled={saving}
            onQuantityChange={(quantity) =>
              setItemQuantity.mutate({ productId: item.productId, quantity })
            }
            onRemove={() => removeItem.mutate({ cartId: cart.id, productId: item.productId })}
          />
        ))}
      </ul>

      {changeError && (
        <p className="form-error" role="alert">
          {errorMessage(changeError)}
        </p>
      )}

      <div className="cart-footer">
        <p className="cart-footer__total">
          <span>{es.cart.total}</span>
          <span className="price price--large">{formatPrice(cart.total)}</span>
        </p>
        <div className="cart-footer__actions">
          <Link className="link" to="/">
            {es.cart.continueShopping}
          </Link>
          {hasStockProblem ? (
            // A link cannot be disabled, so show a disabled button in its place.
            <button className="button button--primary button--large" type="button" disabled>
              {es.cart.checkout}
            </button>
          ) : (
            <Link className="button button--primary button--large" to="/checkout">
              {es.cart.checkout}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

interface CartLineProps {
  item: CartItem;
  disabled: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

/** One product of the cart: name, prices, the - / + quantity control and the remove button. */
function CartLine({ item, disabled, onQuantityChange, onRemove }: CartLineProps) {
  const maxQuantity = Math.min(item.available, MAX_QUANTITY);
  const overStock = item.quantity > item.available;

  return (
    <li className="cart-line">
      <ProductImage imageUrl={item.imageUrl} name={item.name} />

      <div className="cart-line__info">
        <Link className="cart-line__name" to={`/products/${item.productId}`}>
          {item.name}
        </Link>
        <p className="cart-line__unit-price">{es.cart.unitPrice(formatPrice(item.unitPrice))}</p>
        {overStock && <p className="cart-line__warning">{es.cart.stockWarning(item.available)}</p>}
      </div>

      {/* role="group" + aria-label: a screen reader says "Cantidad" before the buttons. */}
      <div className="quantity-control" role="group" aria-label={es.cart.quantityLabel}>
        <button
          className="button quantity-control__button"
          type="button"
          aria-label={es.cart.decrease(item.name)}
          // The minimum is 1: to take the product out there is the remove button.
          disabled={disabled || item.quantity <= 1}
          onClick={() => onQuantityChange(item.quantity - 1)}
        >
          −
        </button>
        <span className="quantity-control__value">{item.quantity}</span>
        <button
          className="button quantity-control__button"
          type="button"
          aria-label={es.cart.increase(item.name)}
          disabled={disabled || item.quantity >= maxQuantity}
          onClick={() => onQuantityChange(item.quantity + 1)}
        >
          +
        </button>
      </div>

      <p className="cart-line__total price">{formatPrice(item.lineTotal)}</p>

      <button
        className="link cart-line__remove"
        type="button"
        aria-label={es.cart.removeLabel(item.name)}
        disabled={disabled}
        onClick={onRemove}
      >
        {es.cart.remove}
      </button>
    </li>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/http';
import { createOrder } from '../api/orders';
import { EmptyCart } from '../components/EmptyCart';
import { OrderSummary } from '../components/OrderSummary';
import { StatusMessage } from '../components/StatusMessage';
import { es } from '../i18n/es';
import { forgetCartId } from '../lib/cartStorage';
import { errorMessage } from '../lib/errorMessage';
import { useCart } from '../lib/useCart';

// Deliberately simple: "something@something.something" without spaces. The server validates
// the address again; this check only catches typos before sending the request.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns the message to show for an invalid e-mail, or null when it is fine. */
function validateEmail(email: string): string | null {
  if (email === '') {
    return es.checkout.emailRequired;
  }
  if (!EMAIL_PATTERN.test(email)) {
    return es.checkout.emailInvalid;
  }
  return null;
}

export function CheckoutPage() {
  const { cart, isLoading, isError, error, refetch } = useCart();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const placeOrder = useMutation({
    mutationFn: createOrder,
    onSuccess: (order) => {
      // The order page can show this order right away, without asking the API for it.
      queryClient.setQueryData(['order', order.id], order);
      navigate(`/orders/${order.id}`);
      // The server deleted the cart: forget its ID and mark the cached copy as outdated.
      forgetCartId();
      return queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (orderError) => {
      // 409 = not enough stock. Read the cart again so each line has its current stock
      // and the cart page can point at the product with the problem.
      if (orderError instanceof ApiError && orderError.status === 409) {
        return queryClient.invalidateQueries({ queryKey: ['cart'] });
      }
    },
  });

  // The order was created and the app is moving to the order page. Without this check the
  // "empty cart" message would flash for an instant, because the cart ID is already gone.
  if (placeOrder.isSuccess) {
    return null;
  }

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

  if (cart === null || cart.items.length === 0) {
    return <EmptyCart />;
  }

  // The constant gives TypeScript a non-null value to use inside the function below.
  const cartId = cart.id;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const problem = validateEmail(trimmedEmail);
    setEmailError(problem);
    if (problem === null) {
      placeOrder.mutate({ cartId, email: trimmedEmail });
    }
  }

  const stockProblem = placeOrder.error instanceof ApiError && placeOrder.error.status === 409;

  return (
    <>
      <title>{`${es.checkout.title} · ${es.brand}`}</title>
      <Link className="link" to="/cart">
        ← {es.checkout.backToCart}
      </Link>
      <header className="page-header checkout__header">
        <h1>{es.checkout.title}</h1>
      </header>

      <div className="checkout">
        <OrderSummary title={es.checkout.summaryTitle} items={cart.items} total={cart.total} />

        {/* noValidate turns off the browser's own bubbles so our messages are the only ones. */}
        <form className="checkout__form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="checkout-email">{es.checkout.emailLabel}</label>
            <input
              id="checkout-email"
              className="input input--large"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError !== null}
              aria-describedby={emailError ? 'checkout-email-error' : 'checkout-email-hint'}
            />
            {emailError ? (
              <p id="checkout-email-error" className="form-error" role="alert">
                {emailError}
              </p>
            ) : (
              <p id="checkout-email-hint" className="checkout__hint">
                {es.checkout.emailHint}
              </p>
            )}
          </div>

          <button
            className="button button--primary button--large"
            type="submit"
            disabled={placeOrder.isPending}
          >
            {placeOrder.isPending ? es.checkout.submitting : es.checkout.submit}
          </button>

          {stockProblem && (
            <p className="form-error" role="alert">
              {es.checkout.stockProblem}{' '}
              <Link className="link" to="/cart">
                {es.checkout.backToCart}
              </Link>
            </p>
          )}
          {placeOrder.isError && !stockProblem && (
            <p className="form-error" role="alert">
              {errorMessage(placeOrder.error)}
            </p>
          )}
        </form>
      </div>
    </>
  );
}

import { expect, test } from '@playwright/test';
import { CHECK_EMAIL } from '../env';
import {
  addProductToCart,
  checkOut,
  PAYMENT_RESULT_TIMEOUT_MS,
  PRODUCT_TO_BUY,
  uniqueEmail,
  waitForEmail,
} from './helpers';

// The two ways a purchase can end, driven through the real browser, API, database and
// payment gateway. Each test starts with a new browser profile, so the cart is empty.

test('a guest buys a product and the order ends up paid', async ({ page, request }) => {
  const email = uniqueEmail();

  await addProductToCart(page, PRODUCT_TO_BUY, 2);
  // The header reads the same cart, so it shows the 2 units without reloading the page.
  await expect(page.getByRole('link', { name: 'Carrito, 2 unidades' })).toBeVisible();

  await page.getByRole('link', { name: 'Carrito, 2 unidades' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carrito' })).toBeVisible();
  const cartLines = page.getByRole('list', { name: 'Productos en el carrito' });
  await expect(cartLines.getByRole('link', { name: PRODUCT_TO_BUY })).toBeVisible();

  await checkOut(page, email);
  await expect(page.getByText('Pendiente de pago', { exact: true })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  // Creating the order empties the cart.
  await expect(page.getByRole('link', { name: 'Carrito, 0 unidades' })).toBeVisible();

  await page.getByRole('button', { name: 'Pagar ahora' }).click();

  // The click only sends the payment to the gateway; the result arrives later by webhook.
  // This assertion retries until the page shows it, up to the timeout.
  await expect(page.getByText('Pago aprobado', { exact: true })).toBeVisible({
    timeout: PAYMENT_RESULT_TIMEOUT_MS,
  });
  await expect(page.getByText('Pagado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pagar ahora' })).toBeHidden();

  if (CHECK_EMAIL) {
    await waitForEmail(request, email, 'Pago recibido');
  }
});

test('a declined payment cancels the order', async ({ page, request }) => {
  const email = uniqueEmail();

  await addProductToCart(page, PRODUCT_TO_BUY, 1);
  await checkOut(page, email);
  await expect(page.getByText('Pendiente de pago', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Simular pago rechazado' }).click();

  await expect(page.getByText('Pedido cancelado', { exact: true })).toBeVisible({
    timeout: PAYMENT_RESULT_TIMEOUT_MS,
  });
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pagar ahora' })).toBeHidden();

  if (CHECK_EMAIL) {
    await waitForEmail(request, email, 'Pedido cancelado');
  }
});

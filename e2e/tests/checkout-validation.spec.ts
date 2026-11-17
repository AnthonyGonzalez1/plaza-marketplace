import { expect, test } from '@playwright/test';
import { addProductToCart, PRODUCT_TO_BUY } from './helpers';

test('an invalid e-mail shows a message and creates no order', async ({ page }) => {
  // Write down every request that would create an order, to prove that none was sent.
  const orderRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/orders')) {
      orderRequests.push(request.url());
    }
  });

  await addProductToCart(page, PRODUCT_TO_BUY, 1);
  await page.getByRole('link', { name: 'Carrito, 1 unidad' }).click();
  await page.getByRole('link', { name: 'Continuar con la compra' }).click();

  const emailField = page.getByRole('textbox', { name: 'Correo electrónico' });
  await emailField.fill('ana@');
  await page.getByRole('button', { name: 'Crear pedido' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Escribe un correo válido, por ejemplo nombre@correo.com.',
  );
  await expect(emailField).toHaveAttribute('aria-invalid', 'true');
  // Still on the checkout page, with the cart untouched and nothing sent to the API.
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('link', { name: 'Carrito, 1 unidad' })).toBeVisible();
  expect(orderRequests).toHaveLength(0);
});

import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_URL } from '../env';
import { PAYMENT_RESULT_TIMEOUT_MS, PRODUCT_FOR_STOCK_CHECK, uniqueEmail } from './helpers';

// This test talks to the API directly (no browser): what it checks is data, not screens, and
// the screens of a declined payment are already covered by purchase.spec.ts.
//
// Assumption: nobody else buys PRODUCT_FOR_STOCK_CHECK while this test runs. No other test of
// this suite touches that product and tests run one at a time, so its stock only changes
// here. The database is shared and keeps its data between runs, so the test never expects an
// absolute number: it compares the stock with the value it read at the start.

const API = `${API_URL}/api/v1`;

/** Finds a product by its exact name and returns its id and the units that can be bought. */
async function readProduct(request: APIRequestContext, name: string) {
  const response = await request.get(`${API}/products`, { params: { q: name, size: 100 } });
  expect(response.ok()).toBe(true);
  const page = (await response.json()) as {
    items: { id: number; name: string; available: number }[];
  };
  const product = page.items.find((item) => item.name === name);
  if (product === undefined) {
    throw new Error(`Product "${name}" is not in the catalog. Was the demo data changed?`);
  }
  return product;
}

test('a declined payment returns the reserved unit to the stock', async ({ request }) => {
  const before = await readProduct(request, PRODUCT_FOR_STOCK_CHECK);
  expect(before.available, 'the product needs at least 1 unit to buy').toBeGreaterThan(0);

  // Cart with 1 unit of the product.
  const cartResponse = await request.post(`${API}/carts`);
  expect(cartResponse.ok()).toBe(true);
  const cart = (await cartResponse.json()) as { id: string };
  const itemResponse = await request.put(`${API}/carts/${cart.id}/items/${before.id}`, {
    data: { quantity: 1 },
  });
  expect(itemResponse.ok()).toBe(true);

  // Checkout: the order reserves the unit, so it is no longer available to other buyers.
  const orderResponse = await request.post(`${API}/orders`, {
    data: { cartId: cart.id, email: uniqueEmail() },
  });
  expect(orderResponse.ok()).toBe(true);
  const order = (await orderResponse.json()) as { id: string };

  const reserved = await readProduct(request, PRODUCT_FOR_STOCK_CHECK);
  expect(reserved.available).toBe(before.available - 1);

  // Ask the fake gateway to decline. 202 = "received"; the result arrives later by webhook.
  const paymentResponse = await request.post(`${API}/orders/${order.id}/payments`, {
    data: { simulateOutcome: 'DECLINED' },
  });
  expect(paymentResponse.status()).toBe(202);

  // Read the order again and again until the webhook has cancelled it.
  await expect
    .poll(
      async () => {
        const response = await request.get(`${API}/orders/${order.id}`);
        const current = (await response.json()) as { status: string };
        return current.status;
      },
      { timeout: PAYMENT_RESULT_TIMEOUT_MS },
    )
    .toBe('CANCELLED');

  // The cancellation and the stock change are one database transaction, so the unit is back.
  const after = await readProduct(request, PRODUCT_FOR_STOCK_CHECK);
  expect(after.available).toBe(before.available);
});

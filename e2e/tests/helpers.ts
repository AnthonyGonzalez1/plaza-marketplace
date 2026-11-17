import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { MAILPIT_URL } from '../env';

// Products from the demo data that the database starts with.
/**
 * Bought through the browser by the purchase tests. It is the product with the most stock (80
 * units): every run really buys 2, and a local database keeps its data between runs.
 */
export const PRODUCT_TO_BUY = 'Manilla tejida en hilo';
/** Used only by the stock test, so no other test changes its stock (see stock.spec.ts). */
export const PRODUCT_FOR_STOCK_CHECK = 'Ruana de lana virgen';

/**
 * The payment result reaches the store through a webhook about 2 seconds after the click, and
 * the page asks for the order every 2 seconds. 20 seconds is far above the normal 2-4 seconds
 * but still fails in reasonable time if the webhook never arrives.
 */
export const PAYMENT_RESULT_TIMEOUT_MS = 20_000;

/** A new address on every call, so each test finds only its own order and its own e-mails. */
export function uniqueEmail(): string {
  return `e2e-${Date.now()}@example.com`;
}

/** Searches the product in the catalog, opens its page and adds the given units to the cart. */
export async function addProductToCart(page: Page, productName: string, quantity: number) {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Buscar' }).fill(productName);
  await page.getByRole('button', { name: 'Buscar' }).click();

  // The whole card is a link; its accessible name contains the product name.
  await page.getByRole('link', { name: productName }).click();
  await expect(page.getByRole('heading', { level: 1, name: productName })).toBeVisible();

  await page.getByRole('spinbutton', { name: 'Cantidad' }).fill(String(quantity));
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  // The confirmation appears when the API has answered: only then is the cart really updated.
  await expect(page.getByText(/^Agregado\. Tienes/)).toBeVisible();
}

/** From any page: opens the cart, continues to the checkout and creates the order. */
export async function checkOut(page: Page, email: string) {
  await page.getByRole('link', { name: /^Carrito,/ }).click();
  await page.getByRole('link', { name: 'Continuar con la compra' }).click();
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email);
  await page.getByRole('button', { name: 'Crear pedido' }).click();

  // The app moves to /orders/<id> once the order exists.
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeVisible();
}

/** The part of a Mailpit answer that the tests read. */
interface MailpitSearchResult {
  messages: { Subject: string }[];
}

/**
 * Waits until Mailpit has exactly one message sent to `to` whose subject starts with
 * `subjectPrefix`. The e-mail is sent in the background after the order changes, so the test
 * has to ask several times: `expect.poll` repeats the function until the value matches.
 */
export async function waitForEmail(request: APIRequestContext, to: string, subjectPrefix: string) {
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:${to}` },
        });
        const result = (await response.json()) as MailpitSearchResult;
        return result.messages.filter((message) => message.Subject.startsWith(subjectPrefix))
          .length;
      },
      {
        message: `one e-mail to ${to} with a subject starting with "${subjectPrefix}"`,
        timeout: 30_000,
      },
    )
    .toBe(1);
}

# Plaza web

React single-page app for the Plaza store: browse, search and filter products, add them to a
cart and place an order as a guest. It talks to `store-api` over REST (`/api/v1`).

| Route              | Page                                                         |
| ------------------ | ------------------------------------------------------------ |
| `/`                | Catalog: search, filters, sort and pagination                |
| `/products/:id`    | Product page with the "add to cart" form                     |
| `/cart`            | Cart: change quantities, remove products, see the total      |
| `/checkout`        | Order summary and the e-mail of the guest; creates the order |
| `/orders/:orderId` | The order and its status; pay it with the simulated gateway  |

Stack: React 19, TypeScript, Vite, React Router, TanStack Query, plain CSS. Tests with Vitest and
React Testing Library.

## Requirements

- Node.js 24 or newer
- pnpm 10 (`npm install --global pnpm@10`)

## Scripts

Run them from this folder (`web/`).

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `pnpm install`      | Installs the dependencies                                  |
| `pnpm dev`          | Dev server with hot reload at http://localhost:5173        |
| `pnpm build`        | Type-checks and builds the static site into `dist/`        |
| `pnpm preview`      | Serves the built `dist/` locally (same API proxy as `dev`) |
| `pnpm test`         | Runs the tests once (`pnpm exec vitest` for watch mode)    |
| `pnpm lint`         | ESLint                                                     |
| `pnpm typecheck`    | TypeScript without emitting files                          |
| `pnpm format`       | Formats every file with Prettier                           |
| `pnpm format:check` | Fails if a file is not formatted (used in CI)              |

## How the app reaches the API

The app always calls **relative URLs** such as `/api/v1/products`. It never knows the address of
the backend, so the same build works everywhere and the browser never needs CORS. Something in
front of the app forwards `/api` to the backend:

| Where               | Who forwards `/api`                | Configured with                                           |
| ------------------- | ---------------------------------- | --------------------------------------------------------- |
| `pnpm dev`          | Vite dev server (`vite.config.ts`) | `VITE_API_PROXY_TARGET` (default `http://localhost:8080`) |
| Docker / production | nginx (`nginx.conf.template`)      | `API_UPSTREAM` (default `http://store-api:8080`)          |

Both also forward `/swagger-ui` and `/v3/api-docs`, so the "API docs" link in the footer works.

### Environment variables

| Variable                | Used by            | Default                 | Purpose                             |
| ----------------------- | ------------------ | ----------------------- | ----------------------------------- |
| `VITE_API_PROXY_TARGET` | `pnpm dev/preview` | `http://localhost:8080` | Backend address for the dev proxy   |
| `API_UPSTREAM`          | Docker image       | `http://store-api:8080` | Backend address for the nginx proxy |

For development, copy `.env.example` to `.env.local` and change the value if your backend runs
somewhere else. Neither variable ends up inside the JavaScript bundle.

## Docker

```sh
docker build -t plaza-web .
docker run --rm -p 8081:8080 -e API_UPSTREAM=http://host.docker.internal:8080 plaza-web
```

The image is a multi-stage build: Node builds the static files, then an unprivileged nginx
(non-root, port 8080) serves them. nginx is configured from `nginx.conf.template`, which the
image entrypoint fills in with `envsubst` when the container starts. It:

- serves `index.html` for any unknown path, so deep links like `/products/12` work;
- caches the hashed files under `/assets/` for a year and never caches `index.html`;
- compresses text responses with gzip;
- forwards `/api/`, `/swagger-ui` and `/v3/api-docs` to `API_UPSTREAM`.

nginx resolves the backend host name **per request** (the address is kept in a variable and a
`resolver` is set from the container's DNS servers). That is why the container starts even when
the backend is not running yet; API calls answer 502 until it is. One consequence: nginx does
not apply DNS search domains, so on Kubernetes `API_UPSTREAM` must use the full service name
(for example `http://store-api.plaza.svc.cluster.local:8080`).

## Structure

```
index.html              HTML shell
vite.config.ts          Vite + Vitest config, dev proxy
nginx.conf.template     nginx site used by the Docker image
src/
  main.tsx              entry point: router and query client providers
  App.tsx               route table
  styles.css            the whole stylesheet (design tokens at the top, light and dark theme)
  api/
    http.ts             fetch wrapper, query-string builder, ApiError (RFC 9457 problem details)
    catalog.ts          types of the REST contract and one function per endpoint
    cart.ts             cart types and endpoints (create, read, set quantity, remove)
    orders.ts           order types and endpoints (create, read, pay)
  components/           Layout, CatalogFilters, ProductCard, ProductImage, StockBadge,
                        Pagination, StatusMessage, AddToCartForm, EmptyCart, OrderSummary
  pages/                CatalogPage, ProductDetailPage, CartPage, CheckoutPage, OrderPage,
                        NotFoundPage (+ their tests)
  lib/
    catalogParams.ts    reads/writes the catalog state from/to the URL query string
    cartStorage.ts      keeps the cart ID in localStorage and tells React when it changes
    useCart.ts          hooks to read the cart and to change it (TanStack Query)
    format.ts           price (COP) and date formatting
    errorMessage.ts     text to show for a failed request
  i18n/es.ts            every user-facing string (Spanish)
  test/                 test setup and helpers (fake fetch, sample data, renderApp)
```

## Design decisions

- **The URL is the state of the catalog.** Search, filters, sort and page live in the query
  string (`/?q=cafe&storeId=2&page=1`). Links are shareable, back/forward work, and there is no
  state to keep in sync. Changing a filter resets the page to the first one.
- **TanStack Query for server data.** It gives caching, loading/error states and request
  cancellation; the URL parameters are the cache key. There is no global client-side store.
- **The cart lives on the server; the browser only keeps its ID.** The ID is stored in
  `localStorage` (`plaza.cartId`) and the content is the query `['cart', cartId]`, shared by
  the header badge and the pages. No cart is created until the first product is added. Every
  change answers with the whole updated cart, which replaces the cached copy. A cart that
  expired on the server (404) is forgotten and shown as empty.
- **A retried checkout cannot create two orders.** The checkout page generates one random
  `Idempotency-Key` per visit and sends it with `POST /orders`. A double click or a retry after
  a network error repeats the same key, and the API answers with the order it already created.
- **The payment is asynchronous, so the order page polls.** `POST /orders/{id}/payments` only
  answers 202 ("sent to the gateway"); the result reaches the backend later through a webhook.
  After a 202 the page reads the order again every 2 seconds until its status stops being
  `PENDING_PAYMENT`, and gives up after 30 seconds with a "check again" button. The gateway is
  simulated: a second button asks it to decline the payment.
- **Debounced search.** Text fields are applied 400 ms after the last keystroke (or at once with
  Enter), so the API is not called on every letter.
- **Tests mock `fetch`, nothing else.** They render the real app and routes, so they cover the
  components, the URL handling and the API layer together.

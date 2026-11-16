# S2 exercises: web

Two small tasks on the React app in `web/`. Each one touches code you should be able to explain
in an interview. Before starting, run the app and the tests once so you know the starting point:

```sh
cd web
pnpm install
pnpm test        # everything green
pnpm dev         # http://localhost:5173 (needs store-api on :8080)
```

Work on a branch (`feat/web-in-stock-filter`), one commit per exercise.

---

## Exercise 1: test the "Última unidad" badge

**Context.** A product card shows "Agotado" when `available === 0` and "Última unidad" when
`available === 1` (see `src/components/StockBadge.tsx`). The first case is already tested in
`src/pages/CatalogPage.test.tsx` ("renders the products returned by the API"). The second one
is not: if someone changed `=== 1` to `<= 1` or deleted the branch, no test would fail.

**Task.** Add a test in `src/pages/CatalogPage.test.tsx` that proves:

1. a product with `available: 1` shows "Última unidad";
2. a product with `available: 5` shows neither "Última unidad" nor "Agotado".

**Hints.**

- Copy the shape of the first test in that file: `mockCatalogApi(() => makePage([...]))`, then
  `renderApp('/')`, then wait for the product with `await screen.findBy...`.
- `makeProduct({ id: 3, name: '...', available: 1 })` builds a product; give each one a
  different `id` and `name`.
- `within(card).getByText(...)` searches inside one card. To assert that something is **not**
  there, use `queryByText` (it returns `null` instead of throwing):
  `expect(within(card).queryByText('Agotado')).not.toBeInTheDocument()`.

**How to verify.**

- `pnpm test` is green.
- Now prove the test really protects the code: in `StockBadge.tsx` change `available === 1` to
  `available === 2`, run `pnpm test` and check that **your** test fails. Undo the change.

**Be ready to explain:** why `findByRole` needs `await` but `getByText` does not, and why the
tests replace `fetch` instead of the functions in `src/api/catalog.ts`.

---

## Exercise 2: "in stock only" filter

**Context.** The catalog keeps all its state in the URL (`src/lib/catalogParams.ts`). The page
reads it with `readCatalogParams`, sends it to the API, and `CatalogFilters` changes it by
calling `onChange` with only the fields that changed. You will add one more filter: a checkbox
"Solo disponibles" that hides sold-out products.

**Coordinate with the backend first.** The API parameter `inStock` (`GET /products?inStock=true`)
does not exist yet: adding it to `store-api` is one of your backend exercises for this session.
Do that one first, or at least agree on the name and meaning (`inStock=true` returns only
products with `available > 0`; leaving it out returns everything). Until the backend supports
it, the checkbox will change the URL and the request but not the results.

**Task.**

1. `src/api/catalog.ts`: add `inStock?: boolean` to `ProductQuery`.
2. `src/api/http.ts`: `QueryParams` only accepts strings and numbers. Decide how a boolean
   travels: the simplest option is to let `QueryParams` accept `boolean` and skip `false` in
   `buildQueryString` (so the URL only ever contains `inStock=true`). Add a unit test for it
   in `src/api/http.test.ts`.
3. `src/lib/catalogParams.ts`: read it in `readCatalogParams`
   (`search.get('inStock') === 'true' ? true : undefined`). `writeCatalogParams` should then
   work without changes; add a test in `catalogParams.test.ts` to confirm it.
4. `src/i18n/es.ts`: add the label (`inStockOnly: 'Solo disponibles'`).
5. `src/components/CatalogFilters.tsx`: add the checkbox. It is not a text field, so it does
   not need the draft or the debounce: handle it like the selects, calling
   `onChange({ inStock: event.target.checked ? true : undefined })`, with
   `checked={params.inStock ?? false}`.
6. A little CSS in `src/styles.css` so the checkbox and its label sit on one line and line up
   with the other filters.
7. Tests in `src/pages/CatalogPage.test.tsx`:
   - clicking the checkbox puts `inStock=true` in the URL and in the request;
   - doing it on `/?page=2` goes back to the first page (compare with the test
     "changing a filter resets the page to the first one").

**Hints.**

- A checkbox needs a `<label>`; the easiest accessible form is
  `<label><input type="checkbox" ... /> {es.catalog.inStockOnly}</label>`.
- In tests: `await user.click(screen.getByRole('checkbox', { name: 'Solo disponibles' }))`.
- You should not need to touch `CatalogPage.tsx`: `changeFilters` already merges any field
  and resets the page. If you find yourself editing it, stop and re-read how `params` flows.
- "Limpiar filtros" must also uncheck the box. It should work for free; check why.

**How to verify.**

- `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` all green.
- In the browser: check the box, the URL shows `?inStock=true`; reload the page, the box is
  still checked; press the back button, it unchecks; open the Network tab and confirm the
  request to `/api/v1/products` carries `inStock=true`.
- With the backend change in place: no card shows "Agotado" while the box is checked.

**Be ready to explain:** why the filter state lives in the URL instead of `useState`, and what
would break (sharing a link, reload, back button) if it did not.

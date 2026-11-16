import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { SORT_OPTIONS, type Category, type ProductSort, type Store } from '../api/catalog';
import { es } from '../i18n/es';
import { DEFAULT_SORT, readWholeNumber, type CatalogParams } from '../lib/catalogParams';

/** How long to wait after the last keystroke before applying the text fields. */
const DEBOUNCE_MS = 400;

/** The three fields the user types into, kept as text while they are being edited. */
interface TextFields {
  q: string;
  minPrice: string;
  maxPrice: string;
}

function textFieldsFrom(params: CatalogParams): TextFields {
  return {
    q: params.q ?? '',
    minPrice: params.minPrice?.toString() ?? '',
    maxPrice: params.maxPrice?.toString() ?? '',
  };
}

interface CatalogFiltersProps {
  /** Current filters, as read from the URL. */
  params: CatalogParams;
  stores: Store[];
  categories: Category[];
  /** Called with only the filters that changed. */
  onChange: (changes: Partial<CatalogParams>) => void;
}

/**
 * Search box, filters and sort order of the catalog.
 *
 * Selects apply as soon as they change. Text fields keep a local draft while the user types
 * and are applied by submitting the form: either the user presses Enter / the button, or a
 * timer submits it after a short pause (debounce), so we do not send a request per keystroke.
 */
export function CatalogFilters({ params, stores, categories, onChange }: CatalogFiltersProps) {
  const [draft, setDraft] = useState(() => textFieldsFrom(params));
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // The URL is the source of truth. When it changes from outside this form (back/forward
  // buttons, "clear filters"), replace the draft with the new values. Comparing during render
  // is the pattern React recommends for "reset state when a prop changes".
  const urlFields = JSON.stringify(textFieldsFrom(params));
  const [syncedFields, setSyncedFields] = useState(urlFields);
  if (urlFields !== syncedFields) {
    setSyncedFields(urlFields);
    setDraft(textFieldsFrom(params));
  }

  // Do not leave a timer running after the component is removed from the page.
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function editTextField(field: keyof TextFields, value: string) {
    setDraft({ ...draft, [field]: value });
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => formRef.current?.requestSubmit(), DEBOUNCE_MS);
  }

  function editPrice(field: 'minPrice' | 'maxPrice', event: ChangeEvent<HTMLInputElement>) {
    // Prices are whole pesos: drop anything that is not a digit.
    editTextField(field, event.target.value.replace(/\D/g, ''));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    window.clearTimeout(timerRef.current);
    onChange({
      q: draft.q.trim() === '' ? undefined : draft.q,
      minPrice: readWholeNumber(draft.minPrice),
      maxPrice: readWholeNumber(draft.maxPrice),
    });
  }

  return (
    <form
      ref={formRef}
      className="filters"
      role="search"
      aria-label={es.catalog.filtersLabel}
      onSubmit={handleSubmit}
    >
      <div className="filters__search">
        <label className="visually-hidden" htmlFor="filter-q">
          {es.catalog.searchLabel}
        </label>
        <input
          id="filter-q"
          className="input input--large"
          type="search"
          name="q"
          autoComplete="off"
          placeholder={es.catalog.searchPlaceholder}
          value={draft.q}
          onChange={(event) => editTextField('q', event.target.value)}
        />
        <button className="button button--primary" type="submit">
          {es.catalog.searchButton}
        </button>
      </div>

      <div className="filters__row">
        <div className="field">
          <label htmlFor="filter-store">{es.catalog.storeLabel}</label>
          <select
            id="filter-store"
            className="input"
            value={params.storeId ?? ''}
            onChange={(event) => onChange({ storeId: readWholeNumber(event.target.value) })}
          >
            <option value="">{es.catalog.allStores}</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="filter-category">{es.catalog.categoryLabel}</label>
          <select
            id="filter-category"
            className="input"
            value={params.categoryId ?? ''}
            onChange={(event) => onChange({ categoryId: readWholeNumber(event.target.value) })}
          >
            <option value="">{es.catalog.allCategories}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field field--narrow">
          <label htmlFor="filter-min-price">{es.catalog.minPriceLabel}</label>
          <input
            id="filter-min-price"
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="$ 0"
            value={draft.minPrice}
            onChange={(event) => editPrice('minPrice', event)}
          />
        </div>

        <div className="field field--narrow">
          <label htmlFor="filter-max-price">{es.catalog.maxPriceLabel}</label>
          <input
            id="filter-max-price"
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="$ 500000"
            value={draft.maxPrice}
            onChange={(event) => editPrice('maxPrice', event)}
          />
        </div>

        <div className="field">
          <label htmlFor="filter-sort">{es.catalog.sortLabel}</label>
          <select
            id="filter-sort"
            className="input"
            value={params.sort ?? DEFAULT_SORT}
            onChange={(event) => onChange({ sort: event.target.value as ProductSort })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {es.catalog.sortOptions[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </form>
  );
}

import { Link, Outlet } from 'react-router';
import { es } from '../i18n/es';
import { useCart } from '../lib/useCart';

const REPO_URL = 'https://github.com/AnthonyGonzalez1/plaza-marketplace';
const API_DOCS_URL = '/swagger-ui.html';

/** Page frame shared by every route: header, main area (the current page) and footer. */
export function Layout() {
  // Same query as the cart page (same cache key), so the badge updates with every change.
  const { cart } = useCart();
  const totalItems = cart?.totalItems ?? 0;

  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        {es.skipToContent}
      </a>

      <header className="site-header">
        <div className="container site-header__inner">
          <Link className="wordmark" to="/" aria-label={es.homeLink}>
            <Logo />
            <span>{es.brand}</span>
          </Link>
          <p className="site-header__tagline">{es.tagline}</p>
          {/* The visible text is "Carrito" plus a number; aria-label gives screen readers
              the full sentence ("Carrito, 2 unidades"). */}
          <Link className="cart-link" to="/cart" aria-label={es.cart.headerLinkLabel(totalItems)}>
            <span>{es.cart.headerLink}</span>
            <span className="cart-link__count">{totalItems}</span>
          </Link>
        </div>
      </header>

      <main id="main" className="container site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <p>{es.footer.note}</p>
          <nav aria-label={es.footer.linksLabel}>
            <ul className="site-footer__links">
              <li>
                <a href={REPO_URL}>{es.footer.sourceCode}</a>
              </li>
              <li>
                <a href={API_DOCS_URL}>{es.footer.apiDocs}</a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Market-stall awning, drawn inline so it follows the accent colour in light and dark mode. */
function Logo() {
  return (
    <svg className="wordmark__logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="wordmark__logo-bg" />
      <path
        className="wordmark__logo-fg"
        d="M6 14 9 7h14l3 7v2a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2z"
      />
      <path className="wordmark__logo-line" d="M9 20.5V25h14v-4.5" />
    </svg>
  );
}

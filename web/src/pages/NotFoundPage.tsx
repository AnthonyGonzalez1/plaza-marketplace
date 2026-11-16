import { Link } from 'react-router';
import { StatusMessage } from '../components/StatusMessage';
import { es } from '../i18n/es';

export function NotFoundPage() {
  return (
    <StatusMessage title={es.notFound.title} hint={es.notFound.hint} heading="h1">
      <Link className="button button--primary" to="/">
        {es.notFound.goHome}
      </Link>
    </StatusMessage>
  );
}

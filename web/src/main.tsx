import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiError } from './api/http';
import { App } from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Results stay fresh for 30 seconds: going back to a page you just saw is instant.
      staleTime: 30_000,
      // Retry once on network or server failures. A 4xx answer (e.g. 404) will not change
      // by asking again, so show it right away.
      retry: (failureCount, error) => {
        const isClientError = error instanceof ApiError && error.status < 500;
        return !isClientError && failureCount < 1;
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

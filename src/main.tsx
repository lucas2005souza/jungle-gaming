import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { queryClient } from './api/queryClient'
import { flushAll } from './api/recorder'
import { startMocks } from './mocks/browser'

async function bootstrap() {
  // The mock API must be ready before the first request, otherwise it would hit the real network.
  await startMocks().catch((error: unknown) => console.error('Mock API failed to start', error));
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
  flushAll(); // re-send matches that were still pending when the page was closed
}

void bootstrap();

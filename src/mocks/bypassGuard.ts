import { AxiosHeaders, isAxiosError, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { MOCK_HEADER } from './shared';

const RETRY_HEADER = 'x-mock-retry';

const wasMocked = (response: Pick<AxiosResponse, 'headers'>): boolean => AxiosHeaders.from(response.headers as AxiosHeaders).has(MOCK_HEADER);


export function installBypassGuard(client: AxiosInstance, heal: () => Promise<void>): () => void {
  async function retryOnce(config: InternalAxiosRequestConfig): Promise<AxiosResponse | null> {
    if (config.headers.has(RETRY_HEADER)) return null;
    config.headers.set(RETRY_HEADER, '1');
    await heal();
    return client.request(config);
  }

  const id = client.interceptors.response.use(
    async (response) => (wasMocked(response) ? response : ((await retryOnce(response.config)) ?? response)),
    async (error: unknown) => {
      if (isAxiosError(error) && error.response && error.config && !wasMocked(error.response)) {
        const retried = await retryOnce(error.config);
        if (retried) return retried;
      }
      throw error;
    },
  );
  return () => client.interceptors.response.eject(id);
}

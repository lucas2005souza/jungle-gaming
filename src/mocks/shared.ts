/**
 * Every response produced by the mock handlers carries this header.
 * Its absence on an /api response means the request skipped MSW (e.g. the browser
 * paused the service worker and it lost its client list), so it hit the real server.
 */
export const MOCK_HEADER = 'x-mock-api';

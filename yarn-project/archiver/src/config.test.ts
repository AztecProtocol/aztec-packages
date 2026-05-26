import { jest } from '@jest/globals';

describe('archiver config mappings', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ARCHIVER_VIEM_POLLING_INTERVAL_MS;
    delete process.env.L1_READER_VIEM_POLLING_INTERVAL_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('composes config mappings without duplicate key collisions', async () => {
    await expect(import('./config.js')).resolves.toHaveProperty('archiverConfigMappings');
  });

  it('uses L1_READER_VIEM_POLLING_INTERVAL_MS for archiver config', async () => {
    process.env.L1_READER_VIEM_POLLING_INTERVAL_MS = '1234';

    const { getArchiverConfigFromEnv } = await import('./config.js');
    const config = getArchiverConfigFromEnv();

    expect(config.viemPollingIntervalMS).toBe(1234);
  });

  it('supports ARCHIVER_VIEM_POLLING_INTERVAL_MS as deprecated fallback', async () => {
    process.env.ARCHIVER_VIEM_POLLING_INTERVAL_MS = '2345';

    const { getArchiverConfigFromEnv } = await import('./config.js');
    const config = getArchiverConfigFromEnv();

    expect(config.viemPollingIntervalMS).toBe(2345);
  });

  it('prefers L1_READER_VIEM_POLLING_INTERVAL_MS over deprecated fallback', async () => {
    process.env.ARCHIVER_VIEM_POLLING_INTERVAL_MS = '2345';
    process.env.L1_READER_VIEM_POLLING_INTERVAL_MS = '1234';

    const { getArchiverConfigFromEnv } = await import('./config.js');
    const config = getArchiverConfigFromEnv();

    expect(config.viemPollingIntervalMS).toBe(1234);
  });
});

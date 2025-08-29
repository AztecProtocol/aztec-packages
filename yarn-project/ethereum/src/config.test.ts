import type { NetworkNames } from '@aztec/foundation/config';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('Config', () => {
  // Store original environment value
  const originalEnv = process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG;

  beforeEach(() => {
    // Clear the module cache to ensure fresh imports
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment value
    if (originalEnv !== undefined) {
      process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG = originalEnv;
    } else {
      delete process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG;
    }
  });

  describe('getEntryQueueConfig', () => {
    const dummyNetworks: NetworkNames[] = ['local', 'testnet-ignition'];
    const realNetworks: NetworkNames[] = ['alpha-testnet', 'testnet'];
    const allNetworks = [...dummyNetworks, ...realNetworks];
    it.each(allNetworks)(
      'should return LocalEntryQueueConfig when FORCE_LOCAL_ENTRY_QUEUE_CONFIG is "true" for %s',
      async networkName => {
        // Set environment variable
        process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG = 'true';

        // Dynamic import to get fresh module with new env var
        const { getEntryQueueConfig } = await import('./config.js');

        const result = getEntryQueueConfig(networkName);

        expect(result).toEqual({
          bootstrapValidatorSetSize: 0,
          bootstrapFlushSize: 0,
          normalFlushSizeMin: 48,
          normalFlushSizeQuotient: 2,
        });
      },
    );

    it.each(realNetworks)(
      'should return TestnetEntryQueueConfig for %s when FORCE_LOCAL_ENTRY_QUEUE_CONFIG is not set',
      async networkName => {
        delete process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG;

        const { getEntryQueueConfig } = await import('./config.js');

        const result = getEntryQueueConfig(networkName);

        expect(result).toEqual({
          bootstrapValidatorSetSize: 750,
          bootstrapFlushSize: 75,
          normalFlushSizeMin: 1,
          normalFlushSizeQuotient: 2475,
        });
      },
    );

    it.each(dummyNetworks)(
      'should return LocalEntryQueueConfig for %s when FORCE_LOCAL_ENTRY_QUEUE_CONFIG is not set',
      async networkName => {
        delete process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG;

        const { getEntryQueueConfig } = await import('./config.js');

        const result = getEntryQueueConfig(networkName);

        expect(result).toEqual({
          bootstrapValidatorSetSize: 0,
          bootstrapFlushSize: 0,
          normalFlushSizeMin: 48,
          normalFlushSizeQuotient: 2,
        });
      },
    );

    it.each(realNetworks)(
      'should return TestnetEntryQueueConfig for %s when FORCE_LOCAL_ENTRY_QUEUE_CONFIG is "false"',
      async networkName => {
        process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG = 'false';

        const { getEntryQueueConfig } = await import('./config.js');

        const result = getEntryQueueConfig(networkName);

        expect(result).toEqual({
          bootstrapValidatorSetSize: 750,
          bootstrapFlushSize: 75,
          normalFlushSizeMin: 1,
          normalFlushSizeQuotient: 2475,
        });
      },
    );

    it('should return LocalEntryQueueConfig for unknown network when FORCE_LOCAL_ENTRY_QUEUE_CONFIG is not set', async () => {
      delete process.env.FORCE_LOCAL_ENTRY_QUEUE_CONFIG;

      const { getEntryQueueConfig } = await import('./config.js');

      const result = getEntryQueueConfig('unknown-network' as any);

      expect(result).toEqual({
        bootstrapValidatorSetSize: 0,
        bootstrapFlushSize: 0,
        normalFlushSizeMin: 48,
        normalFlushSizeQuotient: 2,
      });
    });
  });
});

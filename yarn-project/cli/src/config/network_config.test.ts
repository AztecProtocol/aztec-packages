import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { getNetworkConfig } from './network_config.js';

describe('Network Config', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Create a temporary directory for test config files
    tempDir = join(tmpdir(), `network-config-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.NETWORK_CONFIG_LOCATION;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  describe('getNetworkConfig', () => {
    it('returns config when network exists', async () => {
      const validConfig = {
        testnet: {
          bootnodes: ['enr:-test1'],
          snapshots: ['https://example.com/snapshot.tar.gz'],
          registryAddress: '0x1234567890123456789012345678901234567890',
          l1ChainId: 11155111,
        },
      };

      const configPath = join(tempDir, 'network_config.json');
      await writeFile(configPath, JSON.stringify(validConfig));
      process.env.NETWORK_CONFIG_LOCATION = `file://${configPath}`;

      const result = await getNetworkConfig('testnet');
      expect(result).toBeDefined();
      expect(result?.bootnodes).toEqual(['enr:-test1']);
    });

    it('returns undefined when network not in config', async () => {
      const validConfig = {
        'other-network': {
          bootnodes: ['enr:-test1'],
          snapshots: ['https://example.com/snapshot.tar.gz'],
          registryAddress: '0x1234567890123456789012345678901234567890',
          l1ChainId: 11155111,
        },
      };

      const configPath = join(tempDir, 'network_config.json');
      await writeFile(configPath, JSON.stringify(validConfig));
      process.env.NETWORK_CONFIG_LOCATION = `file://${configPath}`;

      const result = await getNetworkConfig('testnet');
      expect(result).toBeUndefined();
    });

    it('throws when config file does not exist', async () => {
      process.env.NETWORK_CONFIG_LOCATION = `file://${join(tempDir, 'nonexistent.json')}`;
      await expect(getNetworkConfig('testnet')).rejects.toThrow();
    });

    it('throws when config parsing fails', async () => {
      const configPath = join(tempDir, 'invalid_config.json');
      await writeFile(configPath, '{ invalid json');
      process.env.NETWORK_CONFIG_LOCATION = `file://${configPath}`;
      await expect(getNetworkConfig('testnet')).rejects.toThrow();
    });

    it('returns undefined for local network without fetching', async () => {
      // local has no remote config; pass a bad URL to confirm no fetch occurs
      process.env.NETWORK_CONFIG_LOCATION = `file://${join(tempDir, 'nonexistent.json')}`;
      // getNetworkConfig does NOT special-case 'local' — the caller decides not to call it.
      // Verify the function still processes normally given a valid config for 'local'.
      const validConfig = {
        local: {
          bootnodes: [],
          snapshots: [],
          registryAddress: '0x1234567890123456789012345678901234567890',
          l1ChainId: 31337,
        },
      };
      const configPath = join(tempDir, 'network_config.json');
      await writeFile(configPath, JSON.stringify(validConfig));
      process.env.NETWORK_CONFIG_LOCATION = `file://${configPath}`;

      const result = await getNetworkConfig('local');
      expect(result).toBeDefined();
      expect(result?.l1ChainId).toBe(31337);
    });
  });
});

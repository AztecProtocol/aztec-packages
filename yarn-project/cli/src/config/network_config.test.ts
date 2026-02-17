import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { enrichEnvironmentWithNetworkConfig, getNetworkConfig } from './network_config.js';

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
    delete process.env.BOOTSTRAP_NODES;
    delete process.env.L1_CHAIN_ID;
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  describe('enrichEnvironmentWithNetworkConfig', () => {
    it('should not throw when network does not exist in valid config', async () => {
      const validConfigWithoutNetwork = {
        'some-other-network': {
          bootnodes: ['enr:-test1'],
          snapshots: ['https://example.com/snapshot.tar.gz'],
          registryAddress: '0x1234567890123456789012345678901234567890',
          l1ChainId: 11155111,
        },
      };

      const configPath = join(tempDir, 'network_config.json');
      await writeFile(configPath, JSON.stringify(validConfigWithoutNetwork));
      process.env.NETWORK_CONFIG_LOCATION = `file://${configPath}`;

      // Should not throw - network 'testnet' doesn't exist in the config but config is valid
      await expect(enrichEnvironmentWithNetworkConfig('testnet')).resolves.toBeUndefined();

      // Environment should not be enriched since network doesn't exist
      expect(process.env.BOOTSTRAP_NODES).toBeUndefined();
      expect(process.env.L1_CHAIN_ID).toBeUndefined();
    });

    it('should throw when config file does not exist', async () => {
      process.env.NETWORK_CONFIG_LOCATION = `file://${join(tempDir, 'nonexistent.json')}`;

      // Should throw because file doesn't exist
      await expect(enrichEnvironmentWithNetworkConfig('testnet')).rejects.toThrow();
    });

    it('should throw when config parsing fails', async () => {
      const configPath = join(tempDir, 'invalid_config.json');
      await writeFile(configPath, '{ invalid json');
      process.env.NETWORK_CONFIG_LOCATION = `file://${configPath}`;

      // Should throw because config is invalid JSON
      await expect(enrichEnvironmentWithNetworkConfig('testnet')).rejects.toThrow();
    });

    it('should skip local network', async () => {
      // Should return early without fetching
      await expect(enrichEnvironmentWithNetworkConfig('local')).resolves.toBeUndefined();
    });

    it('should enrich environment when network exists in config', async () => {
      const validConfig = {
        testnet: {
          bootnodes: ['enr:-test1', 'enr:-test2'],
          snapshots: ['https://example.com/snapshot.tar.gz'],
          registryAddress: '0x1234567890123456789012345678901234567890',
          l1ChainId: 11155111,
        },
      };

      const configPath = join(tempDir, 'network_config.json');
      await writeFile(configPath, JSON.stringify(validConfig));
      process.env.NETWORK_CONFIG_LOCATION = `file://${configPath}`;

      await enrichEnvironmentWithNetworkConfig('testnet');

      // Environment should be enriched
      expect(process.env.BOOTSTRAP_NODES).toBe('enr:-test1,enr:-test2');
      expect(process.env.L1_CHAIN_ID).toBe('11155111');
      expect(process.env.REGISTRY_CONTRACT_ADDRESS).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('getNetworkConfig', () => {
    it('should return config when network exists', async () => {
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

    it('should return undefined when network not in config', async () => {
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

    it('should throw when config file does not exist', async () => {
      process.env.NETWORK_CONFIG_LOCATION = `file://${join(tempDir, 'nonexistent.json')}`;

      await expect(getNetworkConfig('testnet')).rejects.toThrow();
    });
  });
});

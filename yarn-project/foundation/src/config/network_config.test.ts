import { jest } from '@jest/globals';

import type { ConfigMappingsType } from './index.js';
import {
  type NetworkConfig,
  NetworkConfigMapSchema,
  NetworkConfigSchema,
  networkConfigToTyped,
} from './network_config.js';

describe('NetworkConfig', () => {
  describe('NetworkConfigSchema', () => {
    it('should validate a valid remote config', () => {
      const validConfigInput = {
        bootnodes: ['enr:-test1', 'enr:-test2'],
        snapshots: ['https://example.com/snapshot1.tar.gz'],
        registryAddress: '0x1234567890123456789012345678901234567890',
        feeAssetHandlerAddress: '0x2345678901234567890123456789012345678901',
        l1ChainId: 11155111,
      };

      const result = NetworkConfigSchema.safeParse(validConfigInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bootnodes).toEqual(validConfigInput.bootnodes);
        expect(result.data.snapshots).toEqual(validConfigInput.snapshots);
        expect(result.data.registryAddress.toString()).toBe(validConfigInput.registryAddress);
        expect(result.data.feeAssetHandlerAddress?.toString()).toBe(validConfigInput.feeAssetHandlerAddress);
        expect(result.data.l1ChainId).toBe(validConfigInput.l1ChainId);
      }
    });

    it('should validate config without optional feeAssetHandlerAddress', () => {
      const validConfig = {
        bootnodes: ['enr:-test1'],
        snapshots: ['https://example.com/snapshot1.tar.gz'],
        registryAddress: '0x1234567890123456789012345678901234567890',
        l1ChainId: 11155111,
      };

      const result = NetworkConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid config with missing required fields', () => {
      const invalidConfig = {
        bootnodes: ['enr:-test1'],
      };

      const result = NetworkConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should allow additional unknown fields (permissive parsing)', () => {
      const configWithExtraFields = {
        bootnodes: ['enr:-test1'],
        snapshots: ['https://example.com/snapshot1.tar.gz'],
        registryAddress: '0x1234567890123456789012345678901234567890',
        l1ChainId: 11155111,
        newFeature: 'enabled',
        futureConfig: { someNestedValue: 42, anotherValue: 'test' },
        arrayOfNewStuff: ['item1', 'item2'],
      };

      const result = NetworkConfigSchema.safeParse(configWithExtraFields);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bootnodes).toEqual(configWithExtraFields.bootnodes);
        expect(result.data.registryAddress.toString()).toBe(configWithExtraFields.registryAddress);
        expect(result.data.l1ChainId).toBe(configWithExtraFields.l1ChainId);
        expect((result.data as any).newFeature).toBe('enabled');
        expect((result.data as any).futureConfig).toEqual(configWithExtraFields.futureConfig);
        expect((result.data as any).arrayOfNewStuff).toEqual(configWithExtraFields.arrayOfNewStuff);
      }
    });
  });

  describe('NetworkConfigMapSchema', () => {
    it('should validate multiple network configurations', () => {
      const networkConfigInput = {
        'staging-public': {
          bootnodes: ['enr:-staging1'],
          snapshots: ['https://example.com/staging-snapshot.tar.gz'],
          registryAddress: '0x1234567890123456789012345678901234567890',
          l1ChainId: 11155111,
        },
        testnet: {
          bootnodes: ['enr:-testnet1', 'enr:-testnet2'],
          snapshots: ['https://example.com/testnet-snapshot.tar.gz'],
          registryAddress: '0x2345678901234567890123456789012345678901',
          feeAssetHandlerAddress: '0x3456789012345678901234567890123456789012',
          l1ChainId: 1,
        },
      };

      const result = NetworkConfigMapSchema.safeParse(networkConfigInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['staging-public'].registryAddress.toString()).toBe(
          '0x1234567890123456789012345678901234567890',
        );
        expect(result.data['testnet'].registryAddress.toString()).toBe('0x2345678901234567890123456789012345678901');
        expect(result.data['testnet'].feeAssetHandlerAddress?.toString()).toBe(
          '0x3456789012345678901234567890123456789012',
        );
      }
    });

    it('should handle future network config schema evolution', () => {
      const futureFriendlyNetworkConfig = {
        'staging-public': {
          bootnodes: ['enr:-staging1'],
          snapshots: ['https://example.com/staging-snapshot.tar.gz'],
          registryAddress: '0x1234567890123456789012345678901234567890',
          l1ChainId: 11155111,
          newBootnodeFormat: ['multiaddr:/ip4/...'],
          advancedP2PConfig: { maxPeers: 50, timeout: 30000 },
        },
        testnet: {
          bootnodes: ['enr:-testnet1'],
          snapshots: ['https://example.com/testnet-snapshot.tar.gz'],
          registryAddress: '0x2345678901234567890123456789012345678901',
          l1ChainId: 1,
          experimentalFeatures: ['feature1', 'feature2'],
        },
      };

      const result = NetworkConfigMapSchema.safeParse(futureFriendlyNetworkConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['staging-public'].registryAddress.toString()).toBe(
          '0x1234567890123456789012345678901234567890',
        );
        expect(result.data['testnet'].registryAddress.toString()).toBe('0x2345678901234567890123456789012345678901');
        expect((result.data['staging-public'] as any).newBootnodeFormat).toEqual(['multiaddr:/ip4/...']);
        expect((result.data['staging-public'] as any).advancedP2PConfig).toEqual({ maxPeers: 50, timeout: 30000 });
        expect((result.data['testnet'] as any).experimentalFeatures).toEqual(['feature1', 'feature2']);
      }
    });
  });
});

describe('networkConfigToTyped', () => {
  const baseNetworkConfig: NetworkConfig = {
    bootnodes: ['enr://node1', 'enr://node2'],
    snapshots: ['https://snap1.example.com', 'https://snap2.example.com'],
    registryAddress: '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF',
    l1ChainId: 1,
    nodeVersion: '1.0.0',
  };

  it('passes native-type fields (arrays, numbers) through without calling parseEnv', () => {
    const parseEnvSpy = jest.fn((v: string) => v.split(','));

    interface BootnodesConfig {
      bootstrapNodes: string[];
    }
    const mappings: ConfigMappingsType<BootnodesConfig> = {
      bootstrapNodes: {
        description: 'Bootstrap nodes',
        parseEnv: parseEnvSpy,
      },
    };

    const result = networkConfigToTyped(mappings, baseNetworkConfig);

    expect(result.bootstrapNodes).toEqual(['enr://node1', 'enr://node2']);
    expect(parseEnvSpy).not.toHaveBeenCalled();
  });

  it('calls mapping.parseEnv for string fields that need structured conversion', () => {
    const parseRegistryAddress = jest.fn((val: string) => ({ address: val }));

    interface AddressConfig {
      registryAddress: { address: string };
    }
    const mappings: ConfigMappingsType<AddressConfig> = {
      registryAddress: {
        description: 'Registry address',
        parseEnv: parseRegistryAddress,
      },
    };

    const result = networkConfigToTyped(mappings, baseNetworkConfig);

    expect(parseRegistryAddress).toHaveBeenCalledWith('0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF');
    expect(result.registryAddress).toEqual({ address: '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF' });
  });

  it('passes l1ChainId and blockDurationMs as native numbers without parseEnv', () => {
    const parseEnvSpy = jest.fn((v: string) => Number(v));

    interface ChainConfig {
      l1ChainId: number;
      blockDurationMs: number;
    }
    const mappings: ConfigMappingsType<ChainConfig> = {
      l1ChainId: { description: 'chain id', parseEnv: parseEnvSpy },
      blockDurationMs: { description: 'block duration', parseEnv: parseEnvSpy },
    };

    const networkConfigWithDuration: NetworkConfig = { ...baseNetworkConfig, blockDurationMs: 12000 };
    const result = networkConfigToTyped(mappings, networkConfigWithDuration);

    expect(result.l1ChainId).toBe(1);
    expect(result.blockDurationMs).toBe(12000);
    expect(parseEnvSpy).not.toHaveBeenCalled();
  });

  it('skips optional source fields that are undefined', () => {
    interface OptionalConfig {
      feeAssetHandlerAddress: string;
      blockDurationMs: number;
    }
    const mappings: ConfigMappingsType<OptionalConfig> = {
      feeAssetHandlerAddress: { description: 'fee handler', parseEnv: (v: string) => v },
      blockDurationMs: { description: 'block duration' },
    };

    // baseNetworkConfig has no feeAssetHandlerAddress or blockDurationMs
    const result = networkConfigToTyped(mappings, baseNetworkConfig);

    expect('feeAssetHandlerAddress' in result).toBe(false);
    expect('blockDurationMs' in result).toBe(false);
  });

  it('skips empty arrays', () => {
    interface UrlConfig {
      blobFileStoreUrls: string[];
    }
    const mappings: ConfigMappingsType<UrlConfig> = {
      blobFileStoreUrls: { description: 'blob urls' },
    };

    const networkConfigWithEmptyUrls: NetworkConfig = { ...baseNetworkConfig, blobFileStoreUrls: [] };
    const result = networkConfigToTyped(mappings, networkConfigWithEmptyUrls);

    expect('blobFileStoreUrls' in result).toBe(false);
  });

  it('skips target keys absent from mappings (sub-config use case)', () => {
    // Only provide a mapping for l1ChainId; other network fields should be ignored silently.
    interface ChainOnlyConfig {
      l1ChainId: number;
    }
    const mappings: ConfigMappingsType<ChainOnlyConfig> = {
      l1ChainId: { description: 'chain id' },
    };

    const networkConfigFull: NetworkConfig = {
      ...baseNetworkConfig,
      blobFileStoreUrls: ['https://blob.example.com'],
      blockDurationMs: 12000,
    };

    const result = networkConfigToTyped(mappings, networkConfigFull);

    expect(Object.keys(result)).toEqual(['l1ChainId']);
    expect(result.l1ChainId).toBe(1);
  });

  it('wraps parser errors with key and env name', () => {
    interface RegistryConfig {
      registryAddress: unknown;
    }
    const mappings: ConfigMappingsType<RegistryConfig> = {
      registryAddress: {
        description: 'Registry address',
        env: 'REGISTRY_CONTRACT_ADDRESS',
        parseEnv: () => {
          throw new Error('bad address');
        },
      },
    };

    expect(() => networkConfigToTyped(mappings, baseNetworkConfig)).toThrow(
      "Failed to parse config 'registryAddress' (env: REGISTRY_CONTRACT_ADDRESS): bad address",
    );
  });

  it('maps the full representative NetworkConfig to a typed Partial', () => {
    interface FullConfig {
      bootstrapNodes: string[];
      snapshotsUrls: string[];
      l1ChainId: number;
      blobFileStoreUrls: string[];
      txCollectionFileStoreUrls: string[];
      blockDurationMs: number;
      txPublicSetupAllowListExtend: string[];
    }
    const parseAllowListMock = jest.fn((v: string) => v.split(';'));
    const mappings: ConfigMappingsType<FullConfig> = {
      bootstrapNodes: { description: 'nodes' },
      snapshotsUrls: { description: 'snapshots' },
      l1ChainId: { description: 'chain id' },
      blobFileStoreUrls: { description: 'blob urls' },
      txCollectionFileStoreUrls: { description: 'tx collection urls' },
      blockDurationMs: { description: 'block duration' },
      txPublicSetupAllowListExtend: {
        description: 'allow list',
        parseEnv: parseAllowListMock,
      },
    };

    const fullNetworkConfig: NetworkConfig = {
      bootnodes: ['enr://a'],
      snapshots: ['https://snap.example.com'],
      blobFileStoreUrls: ['s3://blobs'],
      txCollectionFileStoreUrls: ['s3://txs'],
      registryAddress: '0x1234',
      l1ChainId: 31337,
      blockDurationMs: 12000,
      txPublicSetupAllowListExtend: 'I:0xabc:0x1234;C:0xdef:0x5678',
    };

    const result = networkConfigToTyped(mappings, fullNetworkConfig);

    expect(result.bootstrapNodes).toEqual(['enr://a']);
    expect(result.snapshotsUrls).toEqual(['https://snap.example.com']);
    expect(result.l1ChainId).toBe(31337);
    expect(result.blobFileStoreUrls).toEqual(['s3://blobs']);
    expect(result.txCollectionFileStoreUrls).toEqual(['s3://txs']);
    expect(result.blockDurationMs).toBe(12000);
    expect(parseAllowListMock).toHaveBeenCalledWith('I:0xabc:0x1234;C:0xdef:0x5678');
    expect(result.txPublicSetupAllowListExtend).toEqual(['I:0xabc:0x1234', 'C:0xdef:0x5678']);
  });
});

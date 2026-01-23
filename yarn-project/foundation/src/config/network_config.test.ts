import { NetworkConfigMapSchema, NetworkConfigSchema } from './network_config.js';

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
        // Missing required fields
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
        // New fields that might be added in the future
        newFeature: 'enabled',
        futureConfig: {
          someNestedValue: 42,
          anotherValue: 'test',
        },
        arrayOfNewStuff: ['item1', 'item2'],
      };

      const result = NetworkConfigSchema.safeParse(configWithExtraFields);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bootnodes).toEqual(configWithExtraFields.bootnodes);
        expect(result.data.registryAddress.toString()).toBe(configWithExtraFields.registryAddress);
        expect(result.data.l1ChainId).toBe(configWithExtraFields.l1ChainId);
        // Verify that unknown fields are preserved
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
          // Future fields that don't exist in current schema
          newBootnodeFormat: ['multiaddr:/ip4/...'],
          advancedP2PConfig: {
            maxPeers: 50,
            timeout: 30000,
          },
        },
        testnet: {
          bootnodes: ['enr:-testnet1'],
          snapshots: ['https://example.com/testnet-snapshot.tar.gz'],
          registryAddress: '0x2345678901234567890123456789012345678901',
          l1ChainId: 1,
          // Different future fields per network
          experimentalFeatures: ['feature1', 'feature2'],
        },
      };

      const result = NetworkConfigMapSchema.safeParse(futureFriendlyNetworkConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        // Verify existing fields still work
        expect(result.data['staging-public'].registryAddress.toString()).toBe(
          '0x1234567890123456789012345678901234567890',
        );
        expect(result.data['testnet'].registryAddress.toString()).toBe('0x2345678901234567890123456789012345678901');

        // Verify future fields are preserved
        expect((result.data['staging-public'] as any).newBootnodeFormat).toEqual(['multiaddr:/ip4/...']);
        expect((result.data['staging-public'] as any).advancedP2PConfig).toEqual({
          maxPeers: 50,
          timeout: 30000,
        });
        expect((result.data['testnet'] as any).experimentalFeatures).toEqual(['feature1', 'feature2']);
      }
    });
  });
});

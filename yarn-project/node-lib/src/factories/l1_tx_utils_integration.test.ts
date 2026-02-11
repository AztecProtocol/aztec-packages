import { Blob } from '@aztec/blob-lib';
import { getAddressFromPrivateKey } from '@aztec/ethereum/account';
import type { ViemClient } from '@aztec/ethereum/types';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { KeystoreManager } from '@aztec/node-keystore';
import type { EthPrivateKey, KeyStore } from '@aztec/node-keystore';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { generatePrivateKey } from 'viem/accounts';

import { createL1TxUtilsFromSigners } from './l1_tx_utils.js';

describe('L1TxUtils Integration - Publisher Deduplication', () => {
  let kvStore: AztecAsyncKVStore;
  let mockClient: ViemClient;
  let mockTelemetry: TelemetryClient;
  let mockDateProvider: DateProvider;
  let count = 0;

  const mockConfig = {
    dataDirectory: undefined,
    dataStoreMapSizeKb: 1024 * 1024,
  };

  beforeEach(async () => {
    kvStore = await openTmpStore(`l1-tx-utils-integration-test-${count++}`, true);

    // Mock ViemClient
    mockClient = {
      chain: { id: 1 },
      getBalance: () => Promise.resolve(1000000000000000000n),
      getTransactionCount: () => Promise.resolve(0),
      getBlock: () => Promise.resolve({ timestamp: BigInt(Date.now() / 1000) }),
    } as any;

    // Mock TelemetryClient
    mockTelemetry = {
      getMeter: () => ({
        createCounter: () => ({ add: () => {} }),
        createHistogram: () => ({ record: () => {} }),
        createGauge: () => ({ record: () => {} }),
        createUpDownCounter: () => ({ add: () => {} }),
      }),
    } as any;

    // Mock DateProvider
    mockDateProvider = { now: () => Date.now(), nowInSeconds: () => Math.floor(Date.now() / 1000) } as DateProvider;
  });

  afterEach(async () => {
    if (kvStore) {
      await kvStore.close();
    }
  });

  it('should deduplicate 500 validators sharing the same publisher key', async () => {
    // Create a shared publisher private key
    const sharedPublisherKey = generatePrivateKey() as EthPrivateKey;
    const expectedPublisherAddress = EthAddress.fromString(getAddressFromPrivateKey(sharedPublisherKey));

    // Create keystore with many validators, all using the same publisher
    const keystore: KeyStore = {
      schemaVersion: 1,
      validators: times(500, _ => {
        const attesterKey = generatePrivateKey() as EthPrivateKey;
        const attesterAddress = getAddressFromPrivateKey(attesterKey);

        return {
          attester: attesterKey,
          publisher: sharedPublisherKey,
          coinbase: EthAddress.fromString(attesterAddress),
          feeRecipient: AztecAddress.ZERO,
        };
      }),
    };

    // Create KeystoreManager and extract publisher signers
    const manager = new KeystoreManager(keystore);
    const allPublisherSigners = manager.createAllValidatorPublisherSigners();

    // we should have publishers for each validator
    expect(allPublisherSigners).toHaveLength(keystore.validators!.length);

    const l1TxUtils = await createL1TxUtilsFromSigners(mockClient, allPublisherSigners, mockConfig, {
      telemetry: mockTelemetry,
      dateProvider: mockDateProvider,
      kzg: Blob.getViemKzgInstance(),
    });

    // all of the publisherSigners should deduplicate to one L1TxUtils instance
    expect(l1TxUtils).toHaveLength(1);
    expect(l1TxUtils[0].getSenderAddress().equals(expectedPublisherAddress)).toBe(true);
  });

  it('should handle validators with 3 unique publishers correctly', async () => {
    // Create 3 different publisher keys
    const publisherKey1 = generatePrivateKey() as EthPrivateKey;
    const publisherKey2 = generatePrivateKey() as EthPrivateKey;
    const publisherKey3 = generatePrivateKey() as EthPrivateKey;

    const expectedAddresses = [
      EthAddress.fromString(getAddressFromPrivateKey(publisherKey1)),
      EthAddress.fromString(getAddressFromPrivateKey(publisherKey2)),
      EthAddress.fromString(getAddressFromPrivateKey(publisherKey3)),
    ];

    const keystore: KeyStore = {
      schemaVersion: 1,
      validators: [
        ...times(200, () => {
          const addr = EthAddress.random();
          return {
            attester: generatePrivateKey() as EthPrivateKey,
            publisher: publisherKey1,
            coinbase: addr,
            feeRecipient: AztecAddress.ZERO,
          };
        }),
        ...times(200, () => {
          const addr = EthAddress.random();
          return {
            attester: generatePrivateKey() as EthPrivateKey,
            publisher: publisherKey2,
            coinbase: addr,
            feeRecipient: AztecAddress.ZERO,
          };
        }),
        ...times(200, () => {
          const addr = EthAddress.random();
          return {
            attester: generatePrivateKey() as EthPrivateKey,
            publisher: publisherKey3,
            coinbase: addr,
            feeRecipient: AztecAddress.ZERO,
          };
        }),
      ],
    };

    const manager = new KeystoreManager(keystore);
    const allPublisherSigners = manager.createAllValidatorPublisherSigners();

    expect(allPublisherSigners).toHaveLength(keystore.validators!.length);

    const l1TxUtils = await createL1TxUtilsFromSigners(mockClient, allPublisherSigners, mockConfig, {
      telemetry: mockTelemetry,
      dateProvider: mockDateProvider,
      kzg: Blob.getViemKzgInstance(),
    });

    expect(l1TxUtils).toHaveLength(3);

    const actualAddresses = l1TxUtils.map(utils => utils.getSenderAddress().toString().toLowerCase()).sort();
    const expectedAddressesLower = expectedAddresses.map(addr => addr.toString().toLowerCase()).sort();
    expect(actualAddresses).toEqual(expectedAddressesLower);
  });
});

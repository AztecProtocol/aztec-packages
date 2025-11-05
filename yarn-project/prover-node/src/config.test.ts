import { EthAddress } from '@aztec/foundation/eth-address';
import type { EthPrivateKey } from '@aztec/node-keystore';

import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

import { type ProverNodeConfig, createKeyStoreForProver } from './config.js';

describe('createKeyStoreForProver', () => {
  const mockKey1 = generatePrivateKey() as EthPrivateKey;
  const mockKey2 = generatePrivateKey() as EthPrivateKey;
  const mockAddresses = [mockKey1, mockKey2].map(privateKey => EthAddress.fromString(privateKeyToAddress(privateKey)));
  const mockProverId = EthAddress.random();
  const mockSignerUrl = 'http://web3signer:1000';

  const createMockConfig = (
    publisherPrivateKeys: string[] = [],
    proverId?: EthAddress,
    publisherAddresses: EthAddress[] = [],
    web3SignerUrl?: string,
  ): ProverNodeConfig => {
    const mockValue = (val: string) => ({ getValue: () => val });
    return {
      publisherPrivateKeys: publisherPrivateKeys.map(mockValue),
      proverId,
      publisherAddresses,
      web3SignerUrl,
    } as ProverNodeConfig;
  };

  it('should return undefined when no publisher keys are provided', () => {
    const config = createMockConfig([]);
    const result = createKeyStoreForProver(config);
    expect(result).toBeUndefined();
  });

  it('should return undefined when publisherPrivateKeys is undefined', () => {
    const config = {
      publisherPrivateKeys: undefined,
      proverId: undefined,
    } as unknown as ProverNodeConfig;
    const result = createKeyStoreForProver(config);
    expect(result).toBeUndefined();
  });

  it('should create keystore with single publisher key and no proverId', () => {
    const config = createMockConfig([mockKey1]);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: mockKey1,
      remoteSigner: undefined,
      validators: undefined,
    });
  });

  it('should create keystore with multiple publisher keys and no proverId', () => {
    const config = createMockConfig([mockKey1, mockKey2]);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: mockKey1,
      remoteSigner: undefined,
      validators: undefined,
    });
  });

  it('should create keystore with proverId and single publisher key', () => {
    const config = createMockConfig([mockKey1], mockProverId);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: {
        id: mockProverId,
        publisher: [mockKey1],
      },
      remoteSigner: undefined,
      validators: undefined,
    });
  });

  it('should create keystore with proverId and multiple publisher keys', () => {
    const config = createMockConfig([mockKey1, mockKey2], mockProverId);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: {
        id: mockProverId,
        publisher: [mockKey1, mockKey2],
      },
      remoteSigner: undefined,
      validators: undefined,
    });
  });

  it('should create keystore with proverId and multiple publisher addresses', () => {
    const config = createMockConfig([], mockProverId, mockAddresses, mockSignerUrl);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: {
        id: mockProverId,
        publisher: mockAddresses,
      },
      remoteSigner: mockSignerUrl,
      validators: undefined,
    });
  });
});

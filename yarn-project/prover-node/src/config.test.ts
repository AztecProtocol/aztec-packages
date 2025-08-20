import { EthAddress } from '@aztec/foundation/eth-address';
import { type EthAddressHex } from '@aztec/node-keystore';

import { type ProverNodeConfig, createKeyStoreForProver } from './config.js';

describe('createKeyStoreForProver', () => {
  const mockAddress1 = EthAddress.random().toString() as EthAddressHex;
  const mockAddress2 = EthAddress.random().toString() as EthAddressHex;
  const mockProverId = EthAddress.random().toString() as EthAddressHex;

  const createMockConfig = (publisherPrivateKeys: any[] = [], proverId?: EthAddressHex): ProverNodeConfig => {
    const mockValue = (val: string) => ({ getValue: () => val });
    return {
      publisherPrivateKeys: publisherPrivateKeys.map(mockValue),
      proverId,
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
    const config = createMockConfig([mockAddress1]);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: mockAddress1,
      remoteSigner: undefined,
      validators: undefined,
    });
  });

  it('should create keystore with multiple publisher keys and no proverId', () => {
    const config = createMockConfig([mockAddress1, mockAddress2]);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: mockAddress1,
      remoteSigner: undefined,
      validators: undefined,
    });
  });

  it('should create keystore with proverId and single publisher key', () => {
    const config = createMockConfig([mockAddress1], mockProverId);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: {
        id: mockProverId,
        publisher: [mockAddress1],
      },
      remoteSigner: undefined,
      validators: undefined,
    });
  });

  it('should create keystore with proverId and multiple publisher keys', () => {
    const config = createMockConfig([mockAddress1, mockAddress2], mockProverId);
    const result = createKeyStoreForProver(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: {
        id: mockProverId,
        publisher: [mockAddress1, mockAddress2],
      },
      remoteSigner: undefined,
      validators: undefined,
    });
  });
});

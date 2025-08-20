import { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddressHex, EthAddressHex, EthPrivateKey } from '@aztec/node-keystore';
import type { SequencerClientConfig, TxSenderConfig } from '@aztec/sequencer-client/config';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ValidatorClientConfig } from '@aztec/validator-client/config';

import { privateKeyToAddress } from 'viem/accounts';

import { createKeyStoreForValidator } from './config.js';

describe('createKeyStoreForValidator', () => {
  const mockValidatorKey1 = ('0x' + '1'.repeat(64)) as EthPrivateKey;
  const mockValidatorKey2 = ('0x' + '2'.repeat(64)) as EthPrivateKey;
  const mockPublisherKey1 = EthAddress.random().toString() as EthAddressHex;
  const mockPublisherKey2 = EthAddress.random().toString() as EthAddressHex;
  const mockCoinbase = EthAddress.random().toString() as EthAddressHex;
  let mockFeeRecipient: AztecAddressHex;

  const createMockConfig = (
    validatorKeys: string[] = [],
    publisherKeys: string[] = [],
    coinbase?: string,
    feeRecipient?: string,
  ): TxSenderConfig & ValidatorClientConfig & SequencerClientConfig => {
    const mockValidatorPrivateKeys =
      validatorKeys.length > 0
        ? {
            getValue: () => validatorKeys,
          }
        : undefined;

    const mockPublisherPrivateKeys =
      publisherKeys.length > 0 ? publisherKeys.map(key => ({ getValue: () => key })) : undefined;

    return {
      validatorPrivateKeys: mockValidatorPrivateKeys,
      publisherPrivateKeys: mockPublisherPrivateKeys,
      coinbase: coinbase ? { toString: () => coinbase } : undefined,
      feeRecipient: feeRecipient ? { toString: () => feeRecipient } : undefined,
    } as TxSenderConfig & ValidatorClientConfig & SequencerClientConfig;
  };

  beforeAll(async () => {
    mockFeeRecipient = (await AztecAddress.random()).toString() as AztecAddressHex;
  });

  it('should return undefined when no validator keys are provided', () => {
    const config = createMockConfig([]);
    const result = createKeyStoreForValidator(config);
    expect(result).toBeUndefined();
  });

  it('should return undefined when validatorPrivateKeys is undefined', () => {
    const config = {
      validatorPrivateKeys: undefined,
      publisherPrivateKeys: undefined,
      coinbase: undefined,
      feeRecipient: undefined,
    } as unknown as TxSenderConfig & ValidatorClientConfig & SequencerClientConfig;
    const result = createKeyStoreForValidator(config);
    expect(result).toBeUndefined();
  });

  it('should create keystore with single validator key and default coinbase/feeRecipient', () => {
    const config = createMockConfig([mockValidatorKey1]);
    const result = createKeyStoreForValidator(config);

    const expectedCoinbase = privateKeyToAddress(mockValidatorKey1);
    const expectedFeeRecipient = AztecAddress.ZERO.toString();

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [mockValidatorKey1],
          feeRecipient: expectedFeeRecipient,
          coinbase: expectedCoinbase,
          remoteSigner: undefined,
          publisher: [],
        },
      ],
    });
  });

  it('should create keystore with multiple validator keys', () => {
    const config = createMockConfig([mockValidatorKey1, mockValidatorKey2]);
    const result = createKeyStoreForValidator(config);

    const expectedCoinbase = privateKeyToAddress(mockValidatorKey1);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [mockValidatorKey1, mockValidatorKey2],
          feeRecipient: AztecAddress.ZERO.toString(),
          coinbase: expectedCoinbase,
          remoteSigner: undefined,
          publisher: [],
        },
      ],
    });
  });

  it('should create keystore with custom coinbase and feeRecipient', () => {
    const config = createMockConfig([mockValidatorKey1], [], mockCoinbase, mockFeeRecipient);
    const result = createKeyStoreForValidator(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [mockValidatorKey1],
          feeRecipient: mockFeeRecipient,
          coinbase: mockCoinbase,
          remoteSigner: undefined,
          publisher: [],
        },
      ],
    });
  });

  it('should create keystore with publisher keys', () => {
    const config = createMockConfig([mockValidatorKey1], [mockPublisherKey1, mockPublisherKey2]);
    const result = createKeyStoreForValidator(config);

    const expectedCoinbase = privateKeyToAddress(mockValidatorKey1);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [mockValidatorKey1],
          feeRecipient: AztecAddress.ZERO.toString(),
          coinbase: expectedCoinbase,
          remoteSigner: undefined,
          publisher: [mockPublisherKey1, mockPublisherKey2],
        },
      ],
    });
  });

  it('should create keystore with all fields populated', () => {
    const config = createMockConfig(
      [mockValidatorKey1, mockValidatorKey2],
      [mockPublisherKey1],
      mockCoinbase,
      mockFeeRecipient,
    );
    const result = createKeyStoreForValidator(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [mockValidatorKey1, mockValidatorKey2],
          feeRecipient: mockFeeRecipient,
          coinbase: mockCoinbase,
          remoteSigner: undefined,
          publisher: [mockPublisherKey1],
        },
      ],
    });
  });

  it('should handle empty publisher keys array', () => {
    const config = createMockConfig([mockValidatorKey1], []);
    const result = createKeyStoreForValidator(config);

    expect(result?.validators?.[0]?.publisher).toEqual([]);
  });

  it('should use first validator key for coinbase when no coinbase provided', () => {
    const config = createMockConfig([mockValidatorKey1, mockValidatorKey2]);
    const result = createKeyStoreForValidator(config);

    const expectedCoinbase = privateKeyToAddress(mockValidatorKey1);
    expect(result?.validators?.[0]?.coinbase).toBe(expectedCoinbase);
  });

  it('should use AztecAddress.ZERO for feeRecipient when not provided', () => {
    const config = createMockConfig([mockValidatorKey1]);
    const result = createKeyStoreForValidator(config);

    expect(result?.validators?.[0]?.feeRecipient).toBe(AztecAddress.ZERO.toString());
  });
});

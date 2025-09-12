import { EthAddress } from '@aztec/foundation/eth-address';
import type { EthPrivateKey } from '@aztec/node-keystore';
import type { SharedNodeConfig } from '@aztec/node-lib/config';
import type { SequencerClientConfig, TxSenderConfig } from '@aztec/sequencer-client/config';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ValidatorClientConfig } from '@aztec/validator-client/config';

import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

import { createKeyStoreForValidator } from './config.js';

function privateKeyToEthAddress(privateKey: Hex): EthAddress {
  return EthAddress.fromString(privateKeyToAddress(privateKey));
}

describe('createKeyStoreForValidator', () => {
  const mockValidatorKey1 = generatePrivateKey() as EthPrivateKey;
  const mockValidatorKey2 = generatePrivateKey() as EthPrivateKey;
  const mockPublisherKey1 = generatePrivateKey() as EthPrivateKey;
  const mockPublisherKey2 = generatePrivateKey() as EthPrivateKey;
  const mockCoinbase = EthAddress.random();
  const web3SignerUrl = 'http://web3signer:1000';
  const mockValidatorAddresses = [mockValidatorKey1, mockValidatorKey2].map(privateKeyToEthAddress);
  const mockPublisherAddresses = [mockPublisherKey1, mockPublisherKey2].map(privateKeyToEthAddress);
  let mockFeeRecipient: AztecAddress;

  const createMockConfig = (
    validatorKeys: string[] = [],
    publisherKeys: string[] = [],
    coinbase?: EthAddress,
    feeRecipient?: AztecAddress,
    web3SignerUrl?: string,
    validatorAddresses: EthAddress[] = [],
    publisherAddresses: EthAddress[] = [],
  ): TxSenderConfig & ValidatorClientConfig & SequencerClientConfig & SharedNodeConfig => {
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
      coinbase: coinbase,
      feeRecipient: feeRecipient,
      web3SignerUrl,
      validatorAddresses: validatorAddresses.map(addr => addr),
      publisherAddresses: publisherAddresses.map(addr => addr),
    } as TxSenderConfig & ValidatorClientConfig & SequencerClientConfig & SharedNodeConfig;
  };

  beforeAll(async () => {
    mockFeeRecipient = await AztecAddress.random();
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
    } as unknown as TxSenderConfig & ValidatorClientConfig & SequencerClientConfig & SharedNodeConfig;
    const result = createKeyStoreForValidator(config);
    expect(result).toBeUndefined();
  });

  it('should create keystore with single validator key and default coinbase/feeRecipient', () => {
    const config = createMockConfig([mockValidatorKey1]);
    const result = createKeyStoreForValidator(config);

    const expectedCoinbase = privateKeyToEthAddress(mockValidatorKey1);
    const expectedFeeRecipient = AztecAddress.ZERO;

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

    const expectedCoinbase = privateKeyToEthAddress(mockValidatorKey1);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [mockValidatorKey1, mockValidatorKey2],
          feeRecipient: AztecAddress.ZERO,
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

    const expectedCoinbase = privateKeyToEthAddress(mockValidatorKey1);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [mockValidatorKey1],
          feeRecipient: AztecAddress.ZERO,
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

    const expectedCoinbase = privateKeyToEthAddress(mockValidatorKey1);
    expect(result?.validators?.[0]?.coinbase?.equals(expectedCoinbase)).toBeTruthy();
  });

  it('should use AztecAddress.ZERO for feeRecipient when not provided', () => {
    const config = createMockConfig([mockValidatorKey1]);
    const result = createKeyStoreForValidator(config);

    expect(result?.validators?.[0]?.feeRecipient.equals(AztecAddress.ZERO)).toBeTruthy();
  });

  it('should create keystore with remote signer details', () => {
    const config = createMockConfig(
      [],
      [],
      mockCoinbase,
      mockFeeRecipient,
      web3SignerUrl,
      mockValidatorAddresses,
      mockPublisherAddresses,
    );
    const result = createKeyStoreForValidator(config);

    expect(result).toEqual({
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: mockValidatorAddresses,
          feeRecipient: mockFeeRecipient,
          coinbase: mockCoinbase,
          remoteSigner: web3SignerUrl,
          publisher: mockPublisherAddresses,
        },
      ],
    });
  });
});

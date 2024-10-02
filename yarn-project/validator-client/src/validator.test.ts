/**
 * Validation logic unit tests
 */
import { TxHash } from '@aztec/circuit-types';
import { makeHeader } from '@aztec/circuits.js/testing';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type P2P } from '@aztec/p2p';
import { type LightPublicProcessor, type LightPublicProcessorFactory } from '@aztec/simulator';

import { describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { makeBlockProposal } from '../../circuit-types/src/p2p/mocks.js';
import { type ValidatorClientConfig } from './config.js';
import {
  AttestationTimeoutError,
  InvalidValidatorPrivateKeyError,
  PublicProcessorNotProvidedError,
  TransactionsNotAvailableError,
} from './errors/validator.error.js';
import { ValidatorClient } from './validator.js';

describe('ValidationService', () => {
  let config: ValidatorClientConfig;
  let validatorClient: ValidatorClient;
  let p2pClient: MockProxy<P2P>;
  let validatorAccount: PrivateKeyAccount;
  let lightPublicProcessorFactory: MockProxy<LightPublicProcessorFactory>;
  let lightPublicProcessor: MockProxy<LightPublicProcessor>;

  beforeEach(() => {
    p2pClient = mock<P2P>();
    p2pClient.getAttestationsForSlot.mockImplementation(() => Promise.resolve([]));

    lightPublicProcessorFactory = mock<LightPublicProcessorFactory>();
    lightPublicProcessor = mock<LightPublicProcessor>();

    lightPublicProcessorFactory.createWithSyncedState.mockImplementation(() => Promise.resolve(lightPublicProcessor));

    const validatorPrivateKey = generatePrivateKey();
    validatorAccount = privateKeyToAccount(validatorPrivateKey);

    config = {
      validatorPrivateKey: validatorPrivateKey,
      attestationPoolingIntervalMs: 1000,
      attestationWaitTimeoutMs: 1000,
      disableValidator: false,
      validatorReEx: false,
    };
    validatorClient = ValidatorClient.new(config, p2pClient);
  });

  it('Should throw error if an invalid private key is provided', () => {
    config.validatorPrivateKey = '0x1234567890123456789';
    expect(() => ValidatorClient.new(config, p2pClient)).toThrow(InvalidValidatorPrivateKeyError);
  });

  it("Should throw an error if re-execution is enabled but no public processor is provided", () => {
    config.validatorReEx = true;
    expect(() => ValidatorClient.new(config, p2pClient)).toThrow(PublicProcessorNotProvidedError);
  });

  it('Should create a valid block proposal', async () => {
    const header = makeHeader();
    const archive = Fr.random();
    const txs = [1, 2, 3, 4, 5].map(() => TxHash.random());

    const blockProposal = await validatorClient.createBlockProposal(header, archive, txs);

    expect(blockProposal).toBeDefined();

    const validatorAddress = EthAddress.fromString(validatorAccount.address);
    expect(blockProposal.getSender()).toEqual(validatorAddress);
  });

  it('Should a timeout if we do not collect enough attestations in time', async () => {
    const proposal = makeBlockProposal();

    await expect(validatorClient.collectAttestations(proposal, 2)).rejects.toThrow(AttestationTimeoutError);
  });

  it('Should throw an error if the transactions are not available', async () => {
    const proposal = makeBlockProposal();

    // mock the p2pClient.getTxStatus to return undefined for all transactions
    p2pClient.getTxStatus.mockImplementation(() => undefined);
    // Mock the p2pClient.requestTxs to return undefined for all transactions
    p2pClient.requestTxs.mockImplementation(() => Promise.resolve([undefined]));

    await expect(validatorClient.ensureTransactionsAreAvailable(proposal)).rejects.toThrow(
      TransactionsNotAvailableError,
    );
  });

  it("Should not return an attestation if re-execution fails", async () => {
    const proposal = makeBlockProposal();

    // mock the p2pClient.getTxStatus to return undefined for all transactions
    p2pClient.getTxStatus.mockImplementation(() => undefined);

    const val = ValidatorClient.new(config, p2pClient, lightPublicProcessorFactory);
    lightPublicProcessor.process.mockImplementation(() => {
      throw new Error();
    });

    const attestation = await val.attestToProposal(proposal);
    expect(attestation).toBeUndefined();
  })
});

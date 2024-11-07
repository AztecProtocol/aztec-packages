/**
 * Validation logic unit tests
 */
import { TxHash } from '@aztec/circuit-types';
import { makeHeader } from '@aztec/circuits.js/testing';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type P2P } from '@aztec/p2p';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { makeBlockAttestation, makeBlockProposal } from '../../circuit-types/src/p2p/mocks.js';
import { type ValidatorClientConfig } from './config.js';
import {
  AttestationTimeoutError,
  InvalidValidatorPrivateKeyError,
  TransactionsNotAvailableError,
} from './errors/validator.error.js';
import { ValidatorClient } from './validator.js';

describe('ValidationService', () => {
  let config: ValidatorClientConfig;
  let validatorClient: ValidatorClient;
  let p2pClient: MockProxy<P2P>;
  let validatorAccount: PrivateKeyAccount;

  beforeEach(() => {
    p2pClient = mock<P2P>();
    p2pClient.getAttestationsForSlot.mockImplementation(() => Promise.resolve([]));

    const validatorPrivateKey = generatePrivateKey();
    validatorAccount = privateKeyToAccount(validatorPrivateKey);

    config = {
      validatorPrivateKey: validatorPrivateKey,
      attestationPollingIntervalMs: 1000,
      attestationWaitTimeoutMs: 1000,
      disableValidator: false,
    };
    validatorClient = ValidatorClient.new(config, p2pClient, new NoopTelemetryClient());
  });

  it('Should throw error if an invalid private key is provided', () => {
    config.validatorPrivateKey = '0x1234567890123456789';
    expect(() => ValidatorClient.new(config, p2pClient, new NoopTelemetryClient())).toThrow(
      InvalidValidatorPrivateKeyError,
    );
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

  it('Should collect attestations for a proposal', async () => {
    const signer = Secp256k1Signer.random();
    const attestor1 = Secp256k1Signer.random();
    const attestor2 = Secp256k1Signer.random();

    const archive = Fr.random();
    const txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());

    const proposal = makeBlockProposal({ signer, archive, txHashes });

    // Mock the attestations to be returned
    const expectedAttestations = [
      makeBlockAttestation({ signer: attestor1, archive, txHashes }),
      makeBlockAttestation({ signer: attestor2, archive, txHashes }),
    ];
    p2pClient.getAttestationsForSlot.mockImplementation((slot, proposalId) => {
      if (
        slot === proposal.payload.header.globalVariables.slotNumber.toBigInt() &&
        proposalId === proposal.archive.toString()
      ) {
        return Promise.resolve(expectedAttestations);
      }
      return Promise.resolve([]);
    });

    // Perform the query
    const numberOfRequiredAttestations = 3;
    const attestations = await validatorClient.collectAttestations(proposal, numberOfRequiredAttestations);

    expect(attestations).toHaveLength(numberOfRequiredAttestations);
  });
});

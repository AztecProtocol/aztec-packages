import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { makeBlockAttestation, makeBlockProposal, makeHeader, mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import type { ValidatorClientConfig } from './config.js';
import {
  AttestationTimeoutError,
  BlockBuilderNotProvidedError,
  InvalidValidatorPrivateKeyError,
} from './errors/validator.error.js';
import { ValidatorClient } from './validator.js';

describe('ValidatorClient', () => {
  let config: ValidatorClientConfig;
  let validatorClient: ValidatorClient;
  let p2pClient: MockProxy<P2P>;
  let blockSource: MockProxy<L2BlockSource>;
  let epochCache: MockProxy<EpochCache>;
  let validatorAccount: PrivateKeyAccount;
  let dateProvider: TestDateProvider;

  beforeEach(() => {
    p2pClient = mock<P2P>();
    p2pClient.getAttestationsForSlot.mockImplementation(() => Promise.resolve([]));
    epochCache = mock<EpochCache>();
    blockSource = mock<L2BlockSource>();
    dateProvider = new TestDateProvider();

    const validatorPrivateKey = generatePrivateKey();
    validatorAccount = privateKeyToAccount(validatorPrivateKey);

    config = {
      validatorPrivateKey: validatorPrivateKey,
      attestationPollingIntervalMs: 1000,
      disableValidator: false,
      validatorReexecute: false,
    };
    validatorClient = ValidatorClient.new(config, epochCache, p2pClient, blockSource, dateProvider);
  });

  describe('constructor', () => {
    it('should throw error if an invalid private key is provided', () => {
      config.validatorPrivateKey = '0x1234567890123456789';
      expect(() => ValidatorClient.new(config, epochCache, p2pClient, blockSource, dateProvider)).toThrow(
        InvalidValidatorPrivateKeyError,
      );
    });

    it('should throw an error if re-execution is enabled but no block builder is provided', async () => {
      config.validatorReexecute = true;
      const tx = await mockTx();
      const txHashes = await Promise.all([tx.getTxHash()]);
      p2pClient.getTxByHash.mockImplementation(() => Promise.resolve(tx));
      const val = ValidatorClient.new(config, epochCache, p2pClient, blockSource);
      await expect(val.reExecuteTransactions(makeBlockProposal({ txs: [tx], txHashes }), [tx])).rejects.toThrow(
        BlockBuilderNotProvidedError,
      );
    });
  });

  describe('createBlockProposal', () => {
    it('should create a valid block proposal without txs', async () => {
      const header = makeHeader();
      const archive = Fr.random();
      const txs = await Promise.all([1, 2, 3, 4, 5].map(() => mockTx()));

      const blockProposal = await validatorClient.createBlockProposal(
        header.globalVariables.blockNumber,
        header.toPropose(),
        archive,
        header.state,
        txs,
        { publishFullTxs: false },
      );

      expect(blockProposal).toBeDefined();

      const validatorAddress = EthAddress.fromString(validatorAccount.address);
      expect(blockProposal?.getSender()).toEqual(validatorAddress);
      expect(blockProposal!.txs).toBeUndefined();
    });

    it('should create a valid block proposal with txs', async () => {
      const header = makeHeader();
      const archive = Fr.random();
      const txs = await Promise.all([1, 2, 3, 4, 5].map(() => mockTx()));

      const blockProposal = await validatorClient.createBlockProposal(
        header.globalVariables.blockNumber,
        header.toPropose(),
        archive,
        header.state,
        txs,
        { publishFullTxs: true },
      );

      expect(blockProposal).toBeDefined();

      const validatorAddress = EthAddress.fromString(validatorAccount.address);
      expect(blockProposal?.getSender()).toEqual(validatorAddress);
      expect(blockProposal!.txs).toBeDefined();
      expect(blockProposal!.txs).toBe(txs);
    });
  });

  describe('collectAttestations', () => {
    it('should timeout if we do not collect enough attestations in time', async () => {
      const proposal = makeBlockProposal();

      await expect(
        validatorClient.collectAttestations(proposal, 2, new Date(dateProvider.now() + 100)),
      ).rejects.toThrow(AttestationTimeoutError);
    });

    it('should collect attestations for a proposal', async () => {
      const signer = Secp256k1Signer.random();
      const attestor1 = Secp256k1Signer.random();
      const attestor2 = Secp256k1Signer.random();

      const archive = Fr.random();
      const txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());

      const proposal = makeBlockProposal({ signer, archive, txHashes });

      // Mock the attestations to be returned
      const expectedAttestations = [
        makeBlockAttestation({ signer, archive, txHashes }),
        makeBlockAttestation({ signer: attestor1, archive, txHashes }),
        makeBlockAttestation({ signer: attestor2, archive, txHashes }),
      ];
      p2pClient.getAttestationsForSlot.mockImplementation((slot, proposalId) => {
        if (slot === proposal.payload.header.slotNumber.toBigInt() && proposalId === proposal.archive.toString()) {
          return Promise.resolve(expectedAttestations);
        }
        return Promise.resolve([]);
      });

      // Perform the query
      const numberOfRequiredAttestations = 3;
      const attestations = await validatorClient.collectAttestations(
        proposal,
        numberOfRequiredAttestations,
        new Date(dateProvider.now() + 5000),
      );

      expect(attestations).toHaveLength(numberOfRequiredAttestations);
    });
  });

  describe('attestToProposal', () => {
    let proposal: BlockProposal;
    let sender: PeerId;

    const makeTxFromHash = (txHash: TxHash) => ({ getTxHash: () => Promise.resolve(txHash) }) as Tx;

    beforeEach(() => {
      proposal = makeBlockProposal();
      sender = { toString: () => 'proposal-sender-peer-id' } as PeerId;

      p2pClient.getTxStatus.mockResolvedValue('pending');
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => true)));
      p2pClient.getTxByHash.mockImplementation((txHash: TxHash) => Promise.resolve(makeTxFromHash(txHash)));
      p2pClient.getTxsByHash.mockImplementation((txHashes: TxHash[]) => Promise.resolve(txHashes.map(makeTxFromHash)));

      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getProposerInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposal.getSender(),
        nextProposer: proposal.getSender(),
        currentSlot: proposal.slotNumber.toBigInt(),
        nextSlot: proposal.slotNumber.toBigInt() + 1n,
      });

      blockSource.getBlock.mockResolvedValue({
        archive: new AppendOnlyTreeSnapshot(proposal.payload.header.lastArchiveRoot, proposal.blockNumber.toNumber()),
      } as L2Block);
    });

    it('should attest to proposal', async () => {
      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeDefined();
    });

    it('should re-execute and attest to proposal', async () => {
      (validatorClient as any).config.validatorReexecute = true;
      validatorClient.registerBlockBuilder(() =>
        Promise.resolve({
          publicProcessorDuration: 0,
          numTxs: proposal.payload.txHashes.length,
          blockBuildingTimer: new Timer(),
          numFailedTxs: 0,
          block: {
            body: { txEffects: times(proposal.payload.txHashes.length, () => ({})) },
            archive: new AppendOnlyTreeSnapshot(proposal.archive, proposal.blockNumber.toNumber()),
          } as L2Block,
        }),
      );

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeDefined();
    });

    it('should request txs if missing for attesting', async () => {
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, i => i === 0)));

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeDefined();
      expect(p2pClient.getTxsByHash).toHaveBeenCalledWith(proposal.payload.txHashes, sender);
    });

    it('should request txs even if not attestor in this slot', async () => {
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => false)));
      epochCache.isInCommittee.mockResolvedValue(false);

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
      expect(p2pClient.getTxsByHash).toHaveBeenCalledWith(proposal.payload.txHashes, sender);
    });

    it('should throw an error if the transactions are not available', async () => {
      // Mock the p2pClient.getTxStatus to return undefined for all transactions
      p2pClient.getTxStatus.mockResolvedValue(undefined);
      p2pClient.getTxsByHash.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => undefined)));
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => false)));
      // Mock the p2pClient.requestTxs to return undefined for all transactions
      p2pClient.requestTxsByHash.mockImplementation(() => Promise.resolve([undefined]));

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if re-execution fails', async () => {
      (validatorClient as any).config.validatorReexecute = true;
      validatorClient.registerBlockBuilder(() => {
        throw new Error('Failed to build block');
      });

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if the validator is not in the committee', async () => {
      epochCache.isInCommittee.mockImplementation(() => Promise.resolve(false));

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if the proposer is not the current proposer', async () => {
      epochCache.getProposerInCurrentOrNextSlot.mockImplementation(() =>
        Promise.resolve({
          currentProposer: EthAddress.random(),
          nextProposer: EthAddress.random(),
          currentSlot: proposal.slotNumber.toBigInt(),
          nextSlot: proposal.slotNumber.toBigInt() + 1n,
        }),
      );

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if the proposal is not for the current or next slot', async () => {
      epochCache.getProposerInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposal.getSender(),
        nextProposer: proposal.getSender(),
        currentSlot: proposal.slotNumber.toBigInt() + 20n,
        nextSlot: proposal.slotNumber.toBigInt() + 21n,
      });

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });
  });
});

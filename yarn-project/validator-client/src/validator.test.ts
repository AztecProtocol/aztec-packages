import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import { Offense, type SlasherConfig, WANT_TO_SLASH_EVENT } from '@aztec/slasher';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import { Gas } from '@aztec/stdlib/gas';
import type { IFullNodeBlockBuilder } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { makeBlockAttestation, makeBlockProposal, makeHeader, mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { Tx, TxHash } from '@aztec/stdlib/tx';
import { AttestationTimeoutError, InvalidValidatorPrivateKeyError } from '@aztec/stdlib/validators';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import type { ValidatorClientConfig } from './config.js';
import { ValidatorClient } from './validator.js';

describe('ValidatorClient', () => {
  let config: ValidatorClientConfig &
    Pick<SlasherConfig, 'slashInvalidBlockEnabled' | 'slashInvalidBlockPenalty' | 'slashInvalidBlockMaxPenalty'>;
  let validatorClient: ValidatorClient;
  let p2pClient: MockProxy<P2P>;
  let blockSource: MockProxy<L2BlockSource>;
  let epochCache: MockProxy<EpochCache>;
  let blockBuilder: MockProxy<IFullNodeBlockBuilder>;
  let validatorAccounts: PrivateKeyAccount[];
  let dateProvider: TestDateProvider;

  beforeEach(() => {
    p2pClient = mock<P2P>();
    p2pClient.getAttestationsForSlot.mockImplementation(() => Promise.resolve([]));
    blockBuilder = mock<IFullNodeBlockBuilder>();
    blockBuilder.getConfig.mockReturnValue({
      l1GenesisTime: 1n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
    });
    epochCache = mock<EpochCache>();
    blockSource = mock<L2BlockSource>();
    dateProvider = new TestDateProvider();

    const validatorPrivateKeys = [generatePrivateKey(), generatePrivateKey()];
    validatorAccounts = validatorPrivateKeys.map(privateKey => privateKeyToAccount(privateKey));

    config = {
      validatorPrivateKeys: validatorPrivateKeys,
      attestationPollingIntervalMs: 1000,
      disableValidator: false,
      validatorReexecute: false,
      validatorReexecuteDeadlineMs: 6000,
      slashInvalidBlockEnabled: true,
      slashInvalidBlockPenalty: 1n,
      slashInvalidBlockMaxPenalty: 100n,
    };
    validatorClient = ValidatorClient.new(config, blockBuilder, epochCache, p2pClient, blockSource, dateProvider);
  });

  it('Should collect attestations from its own validators', async () => {
    epochCache.filterInCommittee.mockResolvedValueOnce(
      validatorAccounts.map(account => EthAddress.fromString(account.address)),
    );
    const addAttestationsSpy = jest.spyOn(p2pClient, 'addAttestations');
    const proposal = makeBlockProposal();
    // collectAttestations still throws as we don't have a real p2pClient
    await expect(validatorClient.collectAttestations(proposal, 3, new Date(dateProvider.now() + 100))).rejects.toThrow(
      AttestationTimeoutError,
    );
    expect(addAttestationsSpy).toHaveBeenCalled();
    expect(addAttestationsSpy.mock.calls[0][0]).toHaveLength(2);
  });

  describe('constructor', () => {
    it('should throw error if an invalid private key is provided', () => {
      config.validatorPrivateKeys = ['0x1234567890123456789'];
      expect(() => ValidatorClient.new(config, blockBuilder, epochCache, p2pClient, blockSource, dateProvider)).toThrow(
        InvalidValidatorPrivateKeyError,
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
        EthAddress.fromString(validatorAccounts[0].address),
        { publishFullTxs: false },
      );

      expect(blockProposal).toBeDefined();

      const validatorAddress = EthAddress.fromString(validatorAccounts[0].address);
      expect(blockProposal?.getSender()).toEqual(validatorAddress);
      expect(blockProposal!.txs).toBeUndefined();
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
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposal.getSender(),
        nextProposer: proposal.getSender(),
        currentSlot: proposal.slotNumber.toBigInt(),
        nextSlot: proposal.slotNumber.toBigInt() + 1n,
      });
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);

      blockSource.getBlock.mockResolvedValue({
        archive: new AppendOnlyTreeSnapshot(proposal.payload.header.lastArchiveRoot, proposal.blockNumber),
      } as L2Block);
    });

    it('should attest to proposal', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations).toBeDefined();
      expect(attestations?.length).toBe(1);
    });

    it('should re-execute and attest to proposal', async () => {
      (validatorClient as any).config.validatorReexecute = true;
      blockBuilder.buildBlock.mockImplementation(() =>
        Promise.resolve({
          publicProcessorDuration: 0,
          numTxs: proposal.payload.txHashes.length,
          blockBuildingTimer: new Timer(),
          failedTxs: [],
          publicGas: Gas.empty(),
          numMsgs: 0,
          usedTxs: [],
          block: {
            body: { txEffects: times(proposal.payload.txHashes.length, () => ({})) },
            archive: new AppendOnlyTreeSnapshot(proposal.archive, proposal.blockNumber),
          } as L2Block,
        }),
      );

      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations?.length).toBeGreaterThan(0);
    });

    it('should not attest to proposal if roots do not match, and should emit WANT_TO_SLASH_EVENT', async () => {
      // Block builder returns a block with a different root
      const emitSpy = jest.spyOn(validatorClient, 'emit');
      (validatorClient as any).config.validatorReexecute = true;
      blockBuilder.buildBlock.mockImplementation(() =>
        Promise.resolve({
          publicProcessorDuration: 0,
          numTxs: proposal.payload.txHashes.length,
          blockBuildingTimer: new Timer(),
          failedTxs: [],
          publicGas: Gas.empty(),
          numMsgs: 0,
          usedTxs: [],
          block: {
            body: { txEffects: times(proposal.payload.txHashes.length, () => ({})) },
            archive: new AppendOnlyTreeSnapshot(Fr.random(), proposal.blockNumber),
          } as L2Block,
        }),
      );

      // We should not attest to the proposal
      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations).toBeUndefined();

      // We should emit WANT_TO_SLASH_EVENT
      const proposer = proposal.getSender();
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: proposer,
          amount: config.slashInvalidBlockPenalty,
          offense: Offense.INVALID_BLOCK,
        },
      ]);

      // We "remember" that we want to slash this person, up to the max penalty...
      await expect(
        validatorClient.shouldSlash({
          validator: proposer,
          amount: config.slashInvalidBlockMaxPenalty,
          offense: Offense.INVALID_BLOCK,
        }),
      ).resolves.toBe(true);

      // ...but no more than that
      await expect(
        validatorClient.shouldSlash({
          validator: proposer,
          amount: config.slashInvalidBlockMaxPenalty + 1n,
          offense: Offense.INVALID_BLOCK,
        }),
      ).resolves.toBe(false);
    });
    it('should not emit WANT_TO_SLASH_EVENT if slashing is disabled', async () => {
      validatorClient.configureSlashing({ slashInvalidBlockEnabled: false });

      const emitSpy = jest.spyOn(validatorClient, 'emit');
      (validatorClient as any).config.validatorReexecute = true;
      blockBuilder.buildBlock.mockImplementation(() =>
        Promise.resolve({
          publicProcessorDuration: 0,
          numTxs: proposal.payload.txHashes.length,
          blockBuildingTimer: new Timer(),
          failedTxs: [],
          publicGas: Gas.empty(),
          numMsgs: 0,
          usedTxs: [],
          block: {
            body: { txEffects: times(proposal.payload.txHashes.length, () => ({})) },
            archive: new AppendOnlyTreeSnapshot(Fr.random(), proposal.blockNumber),
          } as L2Block,
        }),
      );

      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations).toBeUndefined();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should request txs if missing for attesting', async () => {
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, i => i === 0)));

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeDefined();
      expect(p2pClient.getTxsByHash).toHaveBeenCalledWith(proposal.payload.txHashes, sender);
    });

    it('should request txs even if not attestor in this slot', async () => {
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => false)));
      epochCache.filterInCommittee.mockResolvedValue([]);

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
      blockBuilder.buildBlock.mockImplementation(() => {
        throw new Error('Failed to build block');
      });

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if no validators are in the committee', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce([]);

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if the proposer is not the current proposer', async () => {
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockImplementation(() =>
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

    it('should attest with all validator keys that are in the committee', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce(
        validatorAccounts.map(account => EthAddress.fromString(account.address)),
      );

      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations?.length).toBe(validatorAccounts.length);
    });

    it('should not return an attestation if the proposal is not for the current or next slot', async () => {
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
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

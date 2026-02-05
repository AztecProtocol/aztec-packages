import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { SecretValue, getConfigFromMappings } from '@aztec/foundation/config';
import { Secp256k1Signer, makeEthSignDigest } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Hex } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type KeyStore, KeystoreManager } from '@aztec/node-keystore';
import {
  AuthRequest,
  AuthResponse,
  type P2P,
  type PeerId,
  StatusMessage,
  type TxProvider,
  createSecp256k1PeerId,
} from '@aztec/p2p';
import { OffenseType, WANT_TO_SLASH_EVENT } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import type { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type { SlasherConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import {
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointAttestation,
  makeCheckpointHeader,
  makeCheckpointProposal,
  mockTx,
} from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, TxEffect, TxHash } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import type {
  BuildBlockInCheckpointResult,
  CheckpointBuilder,
  FullNodeCheckpointsBuilder,
} from './checkpoint_builder.js';
import { type ValidatorClientConfig, validatorClientConfigMappings } from './config.js';
import type { HAKeyStore } from './key_store/ha_key_store.js';
import { ValidatorClient } from './validator.js';

describe('ValidatorClient', () => {
  let config: ValidatorClientConfig &
    Pick<SlasherConfig, 'slashBroadcastedInvalidBlockPenalty' | 'slashDuplicateProposalPenalty'> & {
      disableTransactions: boolean;
    };
  let validatorClient: ValidatorClient;
  let p2pClient: MockProxy<P2P>;
  let blockSource: MockProxy<L2BlockSource & L2BlockSink>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let epochCache: MockProxy<EpochCache>;
  let checkpointsBuilder: MockProxy<FullNodeCheckpointsBuilder>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let validatorAccounts: PrivateKeyAccount[];
  let dateProvider: TestDateProvider;
  let txProvider: MockProxy<TxProvider>;
  let keyStoreManager: KeystoreManager;
  let blobClient: MockProxy<BlobClientInterface>;
  let haKeyStore: MockProxy<HAKeyStore>;

  beforeEach(async () => {
    p2pClient = mock<P2P>();
    p2pClient.getCheckpointAttestationsForSlot.mockImplementation(() => Promise.resolve([]));
    p2pClient.handleAuthRequestFromPeer.mockResolvedValue(StatusMessage.random());
    p2pClient.broadcastCheckpointAttestations.mockResolvedValue();
    checkpointsBuilder = mock<FullNodeCheckpointsBuilder>();
    checkpointsBuilder.getConfig.mockReturnValue({
      l1GenesisTime: 1n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
    });
    worldState = mock<WorldStateSynchronizer>();
    epochCache = mock<EpochCache>();
    epochCache.filterInCommittee.mockImplementation((_slot, addresses) => Promise.resolve(addresses));
    epochCache.getL1Constants.mockReturnValue({ epochDuration: 8 } satisfies Parameters<
      typeof getEpochAtSlot
    >[1] as any);
    blockSource = mock<L2BlockSource & L2BlockSink>();
    blockSource.getCheckpointedBlocksForEpoch.mockResolvedValue([]);
    blockSource.getBlocksForSlot.mockResolvedValue([]);
    epochCache.isEscapeHatchOpenAtSlot.mockResolvedValue(false);
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    txProvider = mock<TxProvider>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    dateProvider = new TestDateProvider();
    blobClient = mock<BlobClientInterface>();
    blobClient.canUpload.mockReturnValue(false);
    blobClient.sendBlobsToFilestore.mockResolvedValue(true);
    haKeyStore = mock<HAKeyStore>();
    haKeyStore.start.mockImplementation(() => Promise.resolve());
    haKeyStore.stop.mockImplementation(() => Promise.resolve());

    const validatorPrivateKeys = [generatePrivateKey(), generatePrivateKey()];
    validatorAccounts = validatorPrivateKeys.map(privateKey => privateKeyToAccount(privateKey));

    haKeyStore.getAddresses.mockReturnValue(validatorAccounts.map(account => EthAddress.fromString(account.address)));

    config = {
      validatorPrivateKeys: new SecretValue(validatorPrivateKeys),
      attestationPollingIntervalMs: 1000,
      disableValidator: false,
      disabledValidators: [],
      validatorReexecute: false,
      slashBroadcastedInvalidBlockPenalty: 1n,
      slashDuplicateProposalPenalty: 1n,
      disableTransactions: false,
      haSigningEnabled: false,
      l1Contracts: { rollupAddress: EthAddress.random() },
      nodeId: 'test-node-id',
      pollingIntervalMs: 1000,
      signingTimeoutMs: 1000,
      maxStuckDutiesAgeMs: 72000,
    };

    const keyStore: KeyStore = {
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: validatorPrivateKeys.map(key => key as Hex<32>),
          feeRecipient: AztecAddress.ZERO,
          coinbase: undefined,
          remoteSigner: undefined,
          publisher: [],
        },
      ],
    };
    keyStoreManager = new KeystoreManager(keyStore);

    validatorClient = await ValidatorClient.new(
      config,
      checkpointsBuilder,
      worldState,
      epochCache,
      p2pClient,
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      keyStoreManager,
      blobClient,
      dateProvider,
    );
  });

  describe('createBlockProposal', () => {
    it('should create a valid block proposal without txs', async () => {
      const blockHeader = makeBlockHeader();
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);
      const inHash = Fr.random();
      const archive = Fr.random();
      const txs = await Promise.all([1, 2, 3, 4, 5].map(() => mockTx()));

      const blockProposal = await validatorClient.createBlockProposal(
        blockHeader,
        indexWithinCheckpoint,
        inHash,
        archive,
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
      const proposal = await makeCheckpointProposal({ lastBlock: {} });

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

      const proposal = await makeCheckpointProposal({ signer, archiveRoot: archive, lastBlock: { txHashes } });

      // Mock the attestations to be returned
      const expectedAttestations = [
        makeCheckpointAttestation({ signer, archive, header: proposal.checkpointHeader }),
        makeCheckpointAttestation({ signer: attestor1, archive, header: proposal.checkpointHeader }),
        makeCheckpointAttestation({ signer: attestor2, archive, header: proposal.checkpointHeader }),
      ];
      p2pClient.getCheckpointAttestationsForSlot.mockImplementation((slot, proposalId) => {
        if (proposal.slotNumber === slot && proposalId === proposal.archive.toString()) {
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

    it('should collect attestations from its own validators', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce(
        validatorAccounts.map(account => EthAddress.fromString(account.address)),
      );
      const addCheckpointAttestationsSpy = jest.spyOn(p2pClient, 'addOwnCheckpointAttestations');
      const proposal = await makeCheckpointProposal({ lastBlock: {} });
      // collectAttestations still throws as we don't have a real p2pClient
      await expect(
        validatorClient.collectAttestations(proposal, 3, new Date(dateProvider.now() + 100)),
      ).rejects.toThrow(AttestationTimeoutError);
      expect(addCheckpointAttestationsSpy).toHaveBeenCalled();
      expect(addCheckpointAttestationsSpy.mock.calls[0][0]).toHaveLength(2);
    });

    it('should filter out attestations with mismatched payload', async () => {
      const signer = Secp256k1Signer.random();
      const attestor1 = Secp256k1Signer.random();
      const attestor2 = Secp256k1Signer.random();

      const archive = Fr.random();
      const txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());

      const proposal = await makeCheckpointProposal({ signer, archiveRoot: archive, lastBlock: { txHashes } });

      // Create attestations - one with matching payload, one with mismatched
      const validAttestation = makeCheckpointAttestation({
        signer: attestor1,
        archive,
        header: proposal.checkpointHeader,
      });
      const invalidAttestation = makeCheckpointAttestation({
        signer: attestor2,
        archive: Fr.random(),
        header: proposal.checkpointHeader,
      });

      p2pClient.getCheckpointAttestationsForSlot.mockImplementation((slot, proposalId) =>
        proposal.slotNumber === slot && proposalId === proposal.archive.toString()
          ? Promise.resolve([validAttestation, invalidAttestation])
          : Promise.resolve([]),
      );

      // Perform the query - should timeout but we're testing the filtering behavior
      await expect(
        validatorClient.collectAttestations(proposal, 2, new Date(dateProvider.now() + 1000)),
      ).rejects.toThrow(AttestationTimeoutError);

      // Verify that getCheckpointAttestationsForSlot was called (meaning the loop ran)
      expect(p2pClient.getCheckpointAttestationsForSlot).toHaveBeenCalled();
    });
  });

  describe('validateBlockProposal', () => {
    let proposal: BlockProposal;
    let blockNumber: BlockNumber;
    let sender: PeerId;
    let blockBuildResult: BuildBlockInCheckpointResult;
    let mockCheckpointBuilder: MockProxy<CheckpointBuilder>;

    const makeTxFromHash = (txHash: TxHash) => ({ getTxHash: () => txHash, txHash }) as Tx;

    const enableReexecution = () => {
      validatorClient.updateConfig({ validatorReexecute: true });
      mockCheckpointBuilder = mock<CheckpointBuilder>();
      mockCheckpointBuilder.buildBlock.mockImplementation(() => Promise.resolve(blockBuildResult));
      checkpointsBuilder.openCheckpoint.mockResolvedValue(mockCheckpointBuilder);
      worldState.fork.mockResolvedValue({
        close: () => Promise.resolve(),
        [Symbol.dispose]: () => {},
      } as never);
    };

    beforeEach(async () => {
      const emptyInHash = computeInHashFromL1ToL2Messages([]);
      const blockHeader = makeBlockHeader(1, { blockNumber: BlockNumber(100), slotNumber: SlotNumber(100) });
      blockNumber = BlockNumber(blockHeader.globalVariables.blockNumber);
      proposal = await makeBlockProposal({ blockHeader, inHash: emptyInHash });
      // Set the current time to the start of the slot of the proposal
      const genesisTime = 1n;
      const slotTime = genesisTime + BigInt(proposal.slotNumber) * BigInt(checkpointsBuilder.getConfig().slotDuration);
      dateProvider.setTime(Number(slotTime * 1000n));
      sender = { toString: () => 'proposal-sender-peer-id' } as PeerId;

      p2pClient.getTxStatus.mockResolvedValue('pending');
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => true)));
      p2pClient.getTxsByHash.mockImplementation((txHashes: TxHash[]) => Promise.resolve(txHashes.map(makeTxFromHash)));

      txProvider.getTxsForBlockProposal.mockImplementation((proposal: BlockProposal) =>
        Promise.resolve({
          txs: proposal.txHashes.map(makeTxFromHash),
          missingTxs: [],
        }),
      );

      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: proposal.slotNumber,
        nextSlot: SlotNumber(proposal.slotNumber + 1),
      });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposal.getSender());
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      epochCache.isEscapeHatchOpenAtSlot.mockResolvedValue(false);

      // Return parent block header when requested
      blockSource.getBlockHeaderByArchive.mockResolvedValue({
        getBlockNumber: () => blockNumber - 1,
        getSlot: () => SlotNumber(Number(blockHeader.globalVariables.slotNumber) - 1),
      } as BlockHeader);

      // Return parent block when requested (needed for checkpoint number computation)
      // The parent block has slot - 1, which is different from the proposal's slot
      const parentSlot = SlotNumber(Number(blockHeader.globalVariables.slotNumber) - 1);
      blockSource.getL2Block.mockResolvedValue({
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        header: {
          globalVariables: blockHeader.globalVariables,
          getSlot: () => parentSlot,
        },
      } as unknown as L2Block);

      blockSource.getGenesisValues.mockResolvedValue({ genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT) });
      blockSource.syncImmediate.mockImplementation(() => Promise.resolve());

      const clonedBlockHeader = blockHeader.clone();
      blockBuildResult = {
        publicProcessorDuration: 0,
        numTxs: proposal.txHashes.length,
        failedTxs: [],
        publicGas: Gas.empty(),
        usedTxs: [],
        usedTxBlobFields: 0,
        block: {
          header: clonedBlockHeader,
          body: { txEffects: times(proposal.txHashes.length, () => TxEffect.empty()) },
          archive: new AppendOnlyTreeSnapshot(proposal.archive, blockNumber),
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
        } as unknown as L2Block,
      };
    });

    it('should validate block proposal', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);
    });

    it('should return early when escape hatch is open', async () => {
      epochCache.isEscapeHatchOpenAtSlot.mockResolvedValueOnce(true);

      const handleSpy = jest.spyOn(validatorClient.getBlockProposalHandler(), 'handleBlockProposal');

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
      // We still validate for observability, but we reject the proposal while escape hatch is open.
      expect(handleSpy).toHaveBeenCalled();
    });

    it('should not attest to a checkpoint proposal if we did not validate a block for that slot', async () => {
      const addCheckpointAttestationsSpy = jest.spyOn(p2pClient, 'addOwnCheckpointAttestations');

      const checkpointProposal = await makeCheckpointProposal({
        archiveRoot: proposal.archive,
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: proposal.slotNumber }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(123), slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
      });

      const attestations = await validatorClient.attestToCheckpointProposal(checkpointProposal, sender);
      expect(attestations).toBeUndefined();
      expect(addCheckpointAttestationsSpy).not.toHaveBeenCalled();
    });

    it('should attest to a checkpoint proposal after validating a block for that slot', async () => {
      const addCheckpointAttestationsSpy = jest.spyOn(p2pClient, 'addOwnCheckpointAttestations');

      const didValidate = await validatorClient.validateBlockProposal(proposal, sender);
      expect(didValidate).toBe(true);

      const checkpointProposal = await makeCheckpointProposal({
        archiveRoot: proposal.archive,
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: proposal.slotNumber }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(123), slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
      });

      validatorClient.updateConfig({ skipCheckpointProposalValidation: true });
      const attestations = await validatorClient.attestToCheckpointProposal(checkpointProposal, sender);

      expect(attestations).toBeDefined();
      expect(attestations).toHaveLength(1);
      expect(addCheckpointAttestationsSpy).toHaveBeenCalledTimes(1);
    });

    it('should wait for previous block to sync', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      blockSource.getBlockHeaderByArchive.mockResolvedValueOnce(undefined);
      blockSource.getBlockHeaderByArchive.mockResolvedValueOnce(undefined);
      blockSource.getBlockHeaderByArchive.mockResolvedValueOnce(undefined);
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(blockSource.getBlockHeaderByArchive).toHaveBeenCalledTimes(4);
      expect(isValid).toBe(true);
    });

    it('should re-execute and validate proposal', async () => {
      enableReexecution();
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);
    });

    it('should not validate proposal if roots do not match and should emit WANT_TO_SLASH_EVENT', async () => {
      // Block builder returns a block with a different root
      const emitSpy = jest.spyOn(validatorClient, 'emit');
      enableReexecution();
      blockBuildResult.block.archive.root = Fr.random();

      // Proposal should be invalid
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);

      // We should emit WANT_TO_SLASH_EVENT
      const proposer = proposal.getSender();
      expect(proposer).toBeDefined();
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: proposer!,
          amount: config.slashBroadcastedInvalidBlockPenalty,
          offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
          epochOrSlot: expect.any(BigInt),
        },
      ]);
    });

    it('should not validate proposal if a random field in the proposal does not match', async () => {
      // Block builder returns a block with a different archive root
      enableReexecution();
      blockBuildResult.block.archive.root = Fr.random();

      // Proposal should be invalid
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    it('should not validate proposal if the proposed block number is taken', async () => {
      enableReexecution();
      blockSource.getBlockHeader.mockResolvedValue({} as BlockHeader);
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
      expect(blockSource.getBlockHeader).toHaveBeenCalledWith(blockNumber);
    });

    it('should not emit WANT_TO_SLASH_EVENT if slashing is disabled', async () => {
      validatorClient.updateConfig({ slashBroadcastedInvalidBlockPenalty: 0n });

      const emitSpy = jest.spyOn(validatorClient, 'emit');
      enableReexecution();
      blockBuildResult.block.archive.root = Fr.random();

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should request txs for validating pinning the sender', async () => {
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);

      expect(txProvider.getTxsForBlockProposal).toHaveBeenCalledWith(
        proposal,
        blockNumber,
        expect.objectContaining({ pinnedPeer: sender }),
      );
    });

    it('should request txs even if not in committee in this slot', async () => {
      epochCache.filterInCommittee.mockResolvedValue([]);

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);

      expect(txProvider.getTxsForBlockProposal).toHaveBeenCalledWith(
        proposal,
        blockNumber,
        expect.objectContaining({ pinnedPeer: sender }),
      );
    });

    it('should return false if the transactions are not available', async () => {
      txProvider.getTxsForBlockProposal.mockImplementation(proposal =>
        Promise.resolve({
          txs: [],
          missingTxs: proposal.txHashes,
        }),
      );

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    it('should return false if re-execution fails', async () => {
      enableReexecution();
      mockCheckpointBuilder.buildBlock.mockImplementation(() => {
        throw new Error('Failed to build block');
      });

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    it('should still validate if no validators are in the committee', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce([]);

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);
    });

    it('should return false if the proposer is not the current proposer', async () => {
      epochCache.getProposerAttesterAddressInSlot.mockImplementation(_ => Promise.resolve(EthAddress.random()));

      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: proposal.slotNumber,
        nextSlot: SlotNumber(proposal.slotNumber + 1),
      });

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    it('should validate with any validators in the committee', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce(
        validatorAccounts.map(account => EthAddress.fromString(account.address)),
      );

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);
    });

    it('should return false if the proposal is not for the current or next slot', async () => {
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposal.getSender());
      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: SlotNumber(proposal.slotNumber + 20),
        nextSlot: SlotNumber(proposal.slotNumber + 21),
      });

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    it('should return false if messages do not match', async () => {
      enableReexecution();
      l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([Fr.random()]);

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    describe('non-first block in checkpoint validation', () => {
      // When indexWithinCheckpoint > 0, global variables must match parent block (except blockNumber).
      // The inHash validation is implicitly handled: all blocks in a checkpoint share the same
      // checkpointNumber, so they fetch the same L1-to-L2 messages and compute the same inHash.
      // If a proposal has a different inHash, the existing validation (which computes inHash from
      // L1 messages for the checkpoint) will catch it.

      it('should return false if global variables do not match parent for non-first block in checkpoint', async () => {
        // Create a proposal with indexWithinCheckpoint > 0 (non-first block in checkpoint)
        const parentSlotNumber = 100;
        const parentBlockNumber = 10;
        const parentCheckpointNumber = CheckpointNumber(5);

        // Create parent global variables
        const parentGlobalVariables = GlobalVariables.random({
          blockNumber: BlockNumber(parentBlockNumber),
          slotNumber: SlotNumber(parentSlotNumber),
        });

        // Create proposal global variables with different coinbase (should cause failure)
        // All checkpoint global variables should match except blockNumber
        const proposalGlobalVariables = GlobalVariables.from({
          ...parentGlobalVariables,
          blockNumber: BlockNumber(parentBlockNumber + 1),
          coinbase: EthAddress.random(), // Different from parent - should cause failure
        });

        // Use empty messages and compute the matching inHash
        const emptyInHash = computeInHashFromL1ToL2Messages([]);
        const proposalBlockHeader = makeBlockHeader(1, {
          blockNumber: BlockNumber(parentBlockNumber + 1),
          slotNumber: SlotNumber(parentSlotNumber),
        });
        // Override the global variables on the block header
        (proposalBlockHeader as any).globalVariables = proposalGlobalVariables;

        const nonFirstBlockProposal = await makeBlockProposal({
          blockHeader: proposalBlockHeader,
          indexWithinCheckpoint: IndexWithinCheckpoint(1), // Non-first block in checkpoint
          inHash: emptyInHash,
        });

        // Update epochCache mock for the new proposal
        epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(nonFirstBlockProposal.getSender());
        epochCache.getCurrentAndNextSlot.mockReturnValue({
          currentSlot: nonFirstBlockProposal.slotNumber,
          nextSlot: SlotNumber(nonFirstBlockProposal.slotNumber + 1),
        });

        // Mock parent block header returned by getBlockHeaderByArchive
        const parentBlockHeader = {
          getBlockNumber: () => BlockNumber(parentBlockNumber),
          getSlot: () => SlotNumber(parentSlotNumber),
          globalVariables: parentGlobalVariables,
        } as BlockHeader;
        blockSource.getBlockHeaderByArchive.mockResolvedValue(parentBlockHeader);

        // Mock parent block returned by getL2Block
        const parentBlock = {
          checkpointNumber: parentCheckpointNumber,
          indexWithinCheckpoint: IndexWithinCheckpoint(0), // Parent is first block in checkpoint
          header: {
            globalVariables: parentGlobalVariables,
          },
        } as unknown as L2Block;
        blockSource.getL2Block.mockResolvedValue(parentBlock);

        // Set time for the slot
        const genesisTime = 1n;
        const slotTime =
          genesisTime + BigInt(nonFirstBlockProposal.slotNumber) * BigInt(checkpointsBuilder.getConfig().slotDuration);
        dateProvider.setTime(Number(slotTime * 1000n));

        // Mock txProvider for the new proposal
        txProvider.getTxsForBlockProposal.mockImplementation((p: BlockProposal) =>
          Promise.resolve({
            txs: p.txHashes.map(txHash => ({ getTxHash: () => txHash, txHash }) as Tx),
            missingTxs: [],
          }),
        );

        // Validation should fail because proposal's globalVariables.coinbase differs from parent's
        const isValid = await validatorClient.validateBlockProposal(nonFirstBlockProposal, sender);
        expect(isValid).toBe(false);
      });

      // Note: inHash validation for non-first blocks is implicitly handled by the existing
      // validation that computes inHash from L1-to-L2 messages for the checkpoint. Since all
      // blocks in the same checkpoint share the same checkpointNumber, they will always
      // compute the same inHash from the same L1 messages. If a malicious proposal has a
      // different inHash, it will fail the existing validation at lines 192-200 in
      // block_proposal_handler.ts.
    });

    // TODO(palla/mbps): Blob upload functionality has been moved to checkpoint proposal handling (Phase 6)
    // These tests are skipped until the blob upload is implemented in the new location.
    describe.skip('filestore blob upload', () => {
      it.todo('should upload blobs to filestore after successful checkpoint proposal');
      it.todo('should not attempt upload when fileStoreBlobUploadClient is undefined');
      it.todo('should not fail when blob upload fails');
      it.todo('should trigger re-execution when filestore is configured even if validatorReexecute is false');
      it.todo('should not upload blobs when validation fails');
    });

    it('should validate proposals in fisherman mode but not create or broadcast attestations', async () => {
      // Enable fisherman mode (which also triggers re-execution)
      validatorClient.updateConfig({ fishermanMode: true });

      // Enable re-execution (required in fisherman mode)
      enableReexecution();

      // Set up so validator is NOT in the committee
      epochCache.filterInCommittee.mockResolvedValueOnce([]);

      // Spy on addOwnCheckpointAttestations to verify attestations are NOT added to the pool
      const addCheckpointAttestationsSpy = jest.spyOn(p2pClient, 'addOwnCheckpointAttestations');

      // In the new model, validateBlockProposal returns a boolean
      // Fisherman mode re-executes to validate but doesn't attest (that's for checkpoint proposals)
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);

      // Validation should still succeed even though we're not in the committee
      expect(isValid).toBe(true);

      // Attestations should NOT be added to the p2p pool (block proposals don't create attestations)
      expect(addCheckpointAttestationsSpy).not.toHaveBeenCalled();
    });
  });

  describe('handling auth requests', () => {
    const callHandler = (validator: ValidatorClient, peerId: PeerId, msg: Buffer): Promise<Buffer> => {
      return (validator as any).handleAuthRequest(peerId, msg);
    };

    it('should return empty buffer if auth request is not from a peer we trust with our identity', async () => {
      p2pClient.handleAuthRequestFromPeer.mockRejectedValueOnce('Unauthorised');
      const peerId = await createSecp256k1PeerId();
      const msg = AuthRequest.random().toBuffer();
      const res = await callHandler(validatorClient, peerId, msg);
      expect(res).toEqual(Buffer.alloc(0));
    });

    it('should return empty buffer if validator is not registered', async () => {
      // Our address is not one of those registered
      epochCache.getRegisteredValidators.mockResolvedValueOnce(
        times(10, () => new Secp256k1Signer(Buffer32.fromString(generatePrivateKey())).address),
      );
      const peerId = await createSecp256k1PeerId();
      const msg = AuthRequest.random().toBuffer();
      const res = await callHandler(validatorClient, peerId, msg);
      expect(res).toEqual(Buffer.alloc(0));
    });

    it('should return serialised auth response if we are responding to auth request', async () => {
      // Set up our auth peer handler
      const ourStatus = StatusMessage.random();
      p2pClient.handleAuthRequestFromPeer.mockResolvedValueOnce(ourStatus);
      // Make sure our addresses are registered
      epochCache.getRegisteredValidators.mockResolvedValueOnce(validatorClient.getValidatorAddresses());
      const peerId = await createSecp256k1PeerId();
      const request = AuthRequest.random();
      const res = await callHandler(validatorClient, peerId, request.toBuffer());

      const authResponse = AuthResponse.fromBuffer(res);
      expect(authResponse.status.equals(ourStatus)).toBeTruthy();

      // We should have used the first address to sign
      const payloadToSign = request.getPayloadToSign();
      const firstSigner = new Secp256k1Signer(Buffer32.fromString(config.validatorPrivateKeys!.getValue()[0]));
      const signature = firstSigner.sign(makeEthSignDigest(payloadToSign));
      expect(authResponse.signature.equals(signature)).toBeTruthy();
    });

    it('should sign with the first registered address', async () => {
      // Set up our auth peer handler
      const ourStatus = StatusMessage.random();
      p2pClient.handleAuthRequestFromPeer.mockResolvedValueOnce(ourStatus);
      // Make sure our addresses are registered
      const registeredAddress = validatorClient.getValidatorAddresses()[1];
      const validatorPrivateKey = config.validatorPrivateKeys!.getValue()[1];
      epochCache.getRegisteredValidators.mockResolvedValueOnce([registeredAddress]);
      const peerId = await createSecp256k1PeerId();
      const request = AuthRequest.random();
      const res = await callHandler(validatorClient, peerId, request.toBuffer());

      const authResponse = AuthResponse.fromBuffer(res);
      expect(authResponse.status.equals(ourStatus)).toBeTruthy();

      // We should have used the second address to sign as this is the only one registered
      const payloadToSign = request.getPayloadToSign();
      const firstSigner = new Secp256k1Signer(Buffer32.fromString(validatorPrivateKey));
      const signature = firstSigner.sign(makeEthSignDigest(payloadToSign));
      expect(authResponse.signature.equals(signature)).toBeTruthy();
    });
  });

  describe('configuration', () => {
    it('should use VALIDATOR_PRIVATE_KEY for validatorPrivateKeys when VALIDATOR_PRIVATE_KEYS is not set', () => {
      const originalEnv = process.env;
      const testPrivateKey = '0x' + '1'.repeat(64);

      process.env = {
        ...originalEnv,
        VALIDATOR_PRIVATE_KEY: testPrivateKey,
        VALIDATOR_PRIVATE_KEYS: undefined,
      };

      const config = getConfigFromMappings<ValidatorClientConfig>(validatorClientConfigMappings);
      expect(config.validatorPrivateKeys!.getValue()).toHaveLength(1);
      expect(config.validatorPrivateKeys!.getValue()[0]).toBe(process.env.VALIDATOR_PRIVATE_KEY);
    });

    it('should update configuration', () => {
      validatorClient.updateConfig({ attestationPollingIntervalMs: 2000 });
      expect(validatorClient.getConfig().attestationPollingIntervalMs).toBe(2000);
    });

    it('should skip disabled validator addresses', () => {
      const addresses = validatorClient.getValidatorAddresses();
      validatorClient.updateConfig({ disabledValidators: [validatorClient.getValidatorAddresses()[0]] });
      expect(validatorClient.getValidatorAddresses()).toEqual(addresses.slice(1));
    });
  });

  describe('lifecycle methods', () => {
    it('should run start() / stop() on the HA key store', async () => {
      (validatorClient as any).config.haSigningEnabled = true;
      (validatorClient as any).keyStore = haKeyStore;
      await validatorClient.start();
      expect(haKeyStore.start).toHaveBeenCalledTimes(1);
      await validatorClient.stop();
      expect(haKeyStore.stop).toHaveBeenCalledTimes(1);
    });
  });
});

import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { MAX_FEE_ASSET_PRICE_MODIFIER_BPS } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
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
import { OffenseType, WANT_TO_CLEAR_SLASH_EVENT, WANT_TO_SLASH_EVENT } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type BlockData, BlockHash, L2Block, type L2BlockSink, type L2BlockSource } from '@aztec/stdlib/block';
import { type Checkpoint, CheckpointReexecutionTracker, type ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { SlasherConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type InboxBucket, InboxBucketRef, type L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
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
import { HAKeyStore } from './key_store/ha_key_store.js';
import { type CheckpointProposalValidationFailureReason, ProposalHandler } from './proposal_handler.js';
import { ValidatorClient } from './validator.js';

function makeKeyStore(validator: {
  attester: Hex<32>[] | Hex<32>;
  coinbase?: EthAddress;
  feeRecipient?: AztecAddress;
  publisher?: Hex<32>[];
}): KeyStore {
  return {
    schemaVersion: 1,
    slasher: undefined,
    prover: undefined,
    remoteSigner: undefined,
    validators: [
      {
        attester: Array.isArray(validator.attester) ? validator.attester : [validator.attester],
        feeRecipient: validator.feeRecipient ?? AztecAddress.ZERO,
        coinbase: validator.coinbase,
        remoteSigner: undefined,
        publisher: validator.publisher ?? [],
      },
    ],
  };
}

describe('ValidatorClient', () => {
  let config: ValidatorClientConfig &
    Pick<
      SlasherConfig,
      | 'slashBroadcastedInvalidBlockPenalty'
      | 'slashBroadcastedInvalidCheckpointProposalPenalty'
      | 'slashDuplicateProposalPenalty'
      | 'slashDuplicateAttestationPenalty'
      | 'slashAttestInvalidCheckpointProposalPenalty'
    > & {
      disableTransactions: boolean;
      blockDurationMs: number;
    };
  let validatorClient: ValidatorClient;
  let p2pClient: MockProxy<P2P>;
  let blockSource: MockProxy<L2BlockSource & L2BlockSink>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let epochCache: MockProxy<EpochCache>;
  let checkpointsBuilder: MockProxy<FullNodeCheckpointsBuilder>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let validatorAccounts: PrivateKeyAccount[];
  let validatorPrivateKeys: `0x${string}`[];
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
    p2pClient.getProposalsForSlot.mockResolvedValue({ blockProposals: [], checkpointProposals: [] });
    checkpointsBuilder = mock<FullNodeCheckpointsBuilder>();
    checkpointsBuilder.getConfig.mockReturnValue({
      l1GenesisTime: 1n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
      rollupManaLimit: 200_000_000,
    });
    worldState = mock<WorldStateSynchronizer>();
    epochCache = mock<EpochCache>();

    epochCache.filterInCommittee.mockImplementation((_slot, addresses) => Promise.resolve(addresses));
    // Includes the L1 geometry fields read by the checkpoint-validation publish deadline
    // (getLastL1SlotTimestampForL2Slot needs l1GenesisTime/slotDuration/ethereumSlotDuration), kept
    // consistent with checkpointsBuilder.getConfig() above.
    epochCache.getL1Constants.mockReturnValue({
      epochDuration: 8,
      l1GenesisTime: 1n,
      slotDuration: 24,
      ethereumSlotDuration: 12,
    } as any);
    epochCache.getSlotNow.mockReturnValue(SlotNumber(1));
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(1),
      ts: 0n,
      nowMs: 0n,
    });
    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(1),
      ts: 0n,
      nowSeconds: 0n,
    });
    epochCache.getTargetSlot.mockReturnValue(SlotNumber(1));
    epochCache.getTargetEpochAndSlotInNextL1Slot.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(2),
      ts: 0n,
      nowSeconds: 0n,
    });

    blockSource = mock<L2BlockSource & L2BlockSink>();
    blockSource.getBlocks.mockResolvedValue([]);
    blockSource.getCheckpointsData.mockResolvedValue([]);
    blockSource.getBlocksForSlot.mockResolvedValue([]);
    blockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(Number.MAX_SAFE_INTEGER));
    blockSource.syncImmediate.mockResolvedValue(undefined);
    // The proposal handler sources the parent checkpoint's inboxRollingHash from the block source; serve an
    // empty (all-zero) parent header from the proposed-checkpoint fallback so proposals beyond the genesis
    // checkpoint resolve their chain start. getCheckpointData stays undefined: the checkpoint-proposal path
    // uses it as an already-published-on-L1 existence check.
    blockSource.getProposedCheckpointData.mockImplementation(query =>
      Promise.resolve(
        query && 'number' in query ? ({ header: CheckpointHeader.empty() } as ProposedCheckpointData) : undefined,
      ),
    );
    epochCache.isEscapeHatchOpenAtSlot.mockResolvedValue(false);
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    txProvider = mock<TxProvider>();
    dateProvider = new TestDateProvider();
    blobClient = mock<BlobClientInterface>();
    blobClient.canUpload.mockReturnValue(false);
    blobClient.sendBlobsToFilestore.mockResolvedValue(true);
    haKeyStore = mock<HAKeyStore>();
    haKeyStore.start.mockImplementation(() => Promise.resolve());
    haKeyStore.stop.mockImplementation(() => Promise.resolve());

    validatorPrivateKeys = [generatePrivateKey(), generatePrivateKey()];
    validatorAccounts = validatorPrivateKeys.map(privateKey => privateKeyToAccount(privateKey));

    haKeyStore.getAddresses.mockReturnValue(validatorAccounts.map(account => EthAddress.fromString(account.address)));

    config = {
      validatorPrivateKeys: new SecretValue(validatorPrivateKeys),
      attestationPollingIntervalMs: 1000,
      blockDurationMs: 3000,
      disableValidator: false,
      disabledValidators: [],
      slashBroadcastedInvalidBlockPenalty: 1n,
      slashBroadcastedInvalidCheckpointProposalPenalty: 1n,
      slashDuplicateProposalPenalty: 1n,
      slashDuplicateAttestationPenalty: 1n,
      slashAttestInvalidCheckpointProposalPenalty: 1n,
      disableTransactions: false,
      haSigningEnabled: false,
      l1ChainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId,
      rollupAddress: TEST_COORDINATION_SIGNATURE_CONTEXT.rollupAddress,
      nodeId: 'test-node-id',
      pollingIntervalMs: 1000,
      peerSigningTimeoutMs: 1000,
      maxStuckDutiesAgeMs: 72000,
      dataStoreMapSizeKb: 1024 * 1024,
      allowEphemeralSigningProtection: true,
    };

    keyStoreManager = new KeystoreManager(makeKeyStore({ attester: validatorPrivateKeys.map(key => key as Hex<32>) }));

    validatorClient = (await ValidatorClient.new(
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
      new CheckpointReexecutionTracker(),
      dateProvider,
    )) as ValidatorClient;
  });

  describe('createBlockProposal', () => {
    it('should create a valid block proposal without txs', async () => {
      const blockHeader = makeBlockHeader();
      const indexWithinCheckpoint = IndexWithinCheckpoint(0);
      const archive = Fr.random();
      const txs = await Promise.all([1, 2, 3, 4, 5].map(() => mockTx()));

      const blockProposal = await validatorClient.createBlockProposal(
        blockHeader,
        CheckpointNumber(1),
        indexWithinCheckpoint,
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
        validatorClient.collectAttestations(proposal, 2, new Date(dateProvider.now() + 100), CheckpointNumber(1)),
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
      const expectedPayloadHash = proposal.getPayloadHash();
      p2pClient.getCheckpointAttestationsForSlot.mockImplementation((slot, proposalPayloadHash) => {
        if (proposal.slotNumber === slot && proposalPayloadHash === expectedPayloadHash) {
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
        CheckpointNumber(1),
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
        validatorClient.collectAttestations(proposal, 3, new Date(dateProvider.now() + 100), CheckpointNumber(1)),
      ).rejects.toThrow(AttestationTimeoutError);
      expect(addCheckpointAttestationsSpy).toHaveBeenCalled();
      expect(addCheckpointAttestationsSpy.mock.calls[0][0]).toHaveLength(2);
    });

    it('forwards the proposal payload hash to the pool so mismatched attestations are filtered out', async () => {
      const signer = Secp256k1Signer.random();
      const attestor1 = Secp256k1Signer.random();

      const archive = Fr.random();
      const txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());

      const proposal = await makeCheckpointProposal({ signer, archiveRoot: archive, lastBlock: { txHashes } });

      // The pool is responsible for filtering by payload hash; the validator just forwards it.
      // We mock the pool to return the matching attestation only when queried with the right hash.
      const validAttestation = makeCheckpointAttestation({
        signer: attestor1,
        archive,
        header: proposal.checkpointHeader,
      });

      const expectedPayloadHash = proposal.getPayloadHash();
      p2pClient.getCheckpointAttestationsForSlot.mockImplementation((slot, proposalPayloadHash) =>
        proposal.slotNumber === slot && proposalPayloadHash === expectedPayloadHash
          ? Promise.resolve([validAttestation])
          : Promise.resolve([]),
      );

      // Only one matching attestation is returned, but the validator needs 2 -> times out.
      await expect(
        validatorClient.collectAttestations(proposal, 2, new Date(dateProvider.now() + 1000), CheckpointNumber(1)),
      ).rejects.toThrow(AttestationTimeoutError);

      expect(p2pClient.getCheckpointAttestationsForSlot).toHaveBeenCalledWith(proposal.slotNumber, expectedPayloadHash);
    });
  });

  describe('validateBlockProposal', () => {
    let proposal: BlockProposal;
    let blockNumber: BlockNumber;
    let sender: PeerId;
    let blockBuildResult: BuildBlockInCheckpointResult;
    let mockCheckpointBuilder: MockProxy<CheckpointBuilder>;
    let parentBlockData: BlockData;

    const makeTxFromHash = (txHash: TxHash) => ({ getTxHash: () => txHash, txHash }) as Tx;
    // The tx-collection / re-execution deadline for a block proposal is the single consensus
    // attestation_deadline for the target slot: target_slot_start + S - 2E.
    const getExpectedAttestationDeadline = (targetSlot: SlotNumber) => {
      const { l1GenesisTime, slotDuration } = checkpointsBuilder.getConfig();
      const { ethereumSlotDuration } = epochCache.getL1Constants();
      const targetSlotStart = Number(l1GenesisTime) + Number(targetSlot) * slotDuration;
      return new Date((targetSlotStart + slotDuration - 2 * ethereumSlotDuration) * 1000);
    };
    const makeCheckpointProposalForSlot = () =>
      makeCheckpointProposal({
        archiveRoot: proposal.archive,
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: proposal.slotNumber }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(123), slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
      });
    const makeCheckpointProposalWithHeaderMismatch = async () => {
      const proposalHeader = makeCheckpointHeader(0, { slotNumber: proposal.slotNumber });
      const computedHeader = makeCheckpointHeader(0, {
        slotNumber: proposal.slotNumber,
        totalManaUsed: new Fr(999),
      });
      const checkpointProposal = await makeCheckpointProposal({
        archiveRoot: proposal.archive,
        checkpointHeader: proposalHeader,
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber, slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
      });
      const checkpointBlock = {
        ...blockBuildResult.block,
        number: blockNumber,
        header: makeBlockHeader(1, { blockNumber, slotNumber: proposal.slotNumber }),
        archive: new AppendOnlyTreeSnapshot(proposal.archive, blockNumber),
        checkpointNumber: CheckpointNumber(1),
      } as unknown as L2Block;
      const disposeFork = jest.fn();
      blockSource.getBlocksForSlot.mockResolvedValue([checkpointBlock]);
      checkpointsBuilder.getFork.mockResolvedValue({
        [Symbol.asyncDispose]: disposeFork,
        // Match the proposal's expected starting archive so the fork archive check passes and validation
        // reaches the header-mismatch offense under test.
        getTreeInfo: () => Promise.resolve({ root: proposalHeader.lastArchiveRoot.toBuffer() }),
      } as any);
      mockCheckpointBuilder.completeCheckpoint.mockResolvedValue({
        header: computedHeader,
        archive: new AppendOnlyTreeSnapshot(proposal.archive, blockNumber),
        getCheckpointOutHash: () => Fr.random(),
        blocks: [checkpointBlock],
        number: CheckpointNumber(1),
        slot: proposal.slotNumber,
      } as unknown as Checkpoint);
      return { checkpointProposal, disposeFork };
    };
    const registerAllNodesCheckpointHandler = () => {
      let checkpointHandler: Parameters<P2P['registerAllNodesCheckpointProposalHandler']>[0] | undefined;
      p2pClient.registerAllNodesCheckpointProposalHandler.mockImplementation(handler => {
        checkpointHandler = handler;
      });

      validatorClient
        .getProposalHandler()
        .register(p2pClient, true, undefined, () =>
          validatorClient.getValidatorAddresses().map(address => address.toString()),
        );

      expect(checkpointHandler).toBeDefined();
      return checkpointHandler!;
    };
    const getBroadcastedInvalidCheckpointProposalSlashEvents = (
      emitSpy: jest.SpiedFunction<typeof validatorClient.emit>,
    ) =>
      emitSpy.mock.calls.filter(
        ([event, args]) =>
          event === WANT_TO_SLASH_EVENT &&
          Array.isArray(args) &&
          args[0]?.offenseType === OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
      );
    const getAttestedToInvalidCheckpointProposalSlashEvents = (
      emitSpy: jest.SpiedFunction<typeof validatorClient.emit>,
    ) =>
      emitSpy.mock.calls.filter(
        ([event, args]) =>
          event === WANT_TO_SLASH_EVENT &&
          Array.isArray(args) &&
          args[0]?.offenseType === OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
      );
    // Streaming Inbox: an empty-consumption streaming setup. Proposals reference the genesis Inbox bucket, the
    // parent block's L1-to-L2 leaf count equals its cumulative total (0), so the derived per-block bundle is empty.
    const genesisInboxBucket: InboxBucket = {
      seq: 0n,
      inboxRollingHash: Fr.ZERO,
      totalMsgCount: 0n,
      timestamp: 0n,
      msgCount: 0,
      lastMessageIndex: 0n,
    };
    const genesisBucketRef = InboxBucketRef.fromBucket(genesisInboxBucket);

    beforeEach(async () => {
      const blockHeader = makeBlockHeader(1, { blockNumber: BlockNumber(100), slotNumber: SlotNumber(100) });
      blockNumber = BlockNumber(blockHeader.globalVariables.blockNumber);
      proposal = await makeBlockProposal({ blockHeader, bucketRef: genesisBucketRef });
      // The proposal targets slot 100, which under pipelining is built during the previous slot. Set the
      // wall clock to the start of that build slot (target_slot_start - S), matching how a pipelined
      // proposer is positioned when validating an inbound block proposal. With S - 2E = 0 in this config
      // the reexecution deadline (attestation_deadline = target_slot_start + S - 2E) equals the target
      // slot start, so this leaves a full slot of headroom before the deadline.
      const genesisTime = 1n;
      const slotDuration = BigInt(checkpointsBuilder.getConfig().slotDuration);
      const buildSlotTime = genesisTime + BigInt(proposal.slotNumber - 1) * slotDuration;
      dateProvider.setTime(Number(buildSlotTime * 1000n));
      const buildSlot = SlotNumber(proposal.slotNumber - 1);
      sender = { toString: () => 'proposal-sender-peer-id' } as PeerId;

      p2pClient.getTxStatus.mockResolvedValue('pending');
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => true)));

      txProvider.getTxsForBlockProposal.mockImplementation((proposal: BlockProposal) =>
        Promise.resolve({
          txs: proposal.txHashes.map(makeTxFromHash),
          missingTxs: [],
        }),
      );

      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getSlotNow.mockReturnValue(buildSlot);
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: proposal.slotNumber,
        nextSlot: SlotNumber(proposal.slotNumber + 1),
      });
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: buildSlot,
        ts: buildSlotTime,
        nowMs: buildSlotTime * 1000n,
      });
      epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: buildSlot,
        ts: buildSlotTime,
        nowSeconds: buildSlotTime,
      });
      epochCache.getTargetSlot.mockReturnValue(proposal.slotNumber);
      epochCache.getTargetEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(proposal.slotNumber + 1),
        ts: buildSlotTime,
        nowSeconds: buildSlotTime,
      });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposal.getSender());
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      epochCache.isEscapeHatchOpenAtSlot.mockResolvedValue(false);

      // Return parent block data when requested by archive root (parent block lookup).
      // Return undefined for number-based queries (existence check — the proposed block must not exist yet).
      const parentSlot = SlotNumber(Number(blockHeader.globalVariables.slotNumber) - 1);
      parentBlockData = {
        header: {
          getBlockNumber: () => blockNumber - 1,
          getSlot: () => parentSlot,
          globalVariables: blockHeader.globalVariables,
          state: { l1ToL2MessageTree: { nextAvailableLeafIndex: 0 } },
        },
        archive: new AppendOnlyTreeSnapshot(Fr.random(), blockNumber - 1),
        blockHash: BlockHash.random(),
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      } as unknown as BlockData;
      blockSource.getBlockData.mockImplementation(query =>
        Promise.resolve('number' in query ? undefined : parentBlockData),
      );

      blockSource.getGenesisValues.mockResolvedValue({ genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT) });
      blockSource.syncImmediate.mockImplementation(() => Promise.resolve());

      // Resolve every Inbox bucket query to the genesis bucket, so streaming checks accept with an empty bundle.
      l1ToL2MessageSource.getInboxBucket.mockResolvedValue(genesisInboxBucket);
      l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue(genesisInboxBucket);
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockResolvedValue([]);

      const clonedBlockHeader = blockHeader.clone();
      blockBuildResult = {
        publicProcessorDuration: 0,
        numTxs: proposal.txHashes.length,
        failedTxs: [],
        usedTxs: [],
        block: {
          header: clonedBlockHeader,
          body: { txEffects: times(proposal.txHashes.length, () => TxEffect.empty()) },
          archive: new AppendOnlyTreeSnapshot(proposal.archive, blockNumber),
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
        } as unknown as L2Block,
      };

      // Set up reexecution mocks (reexecution is always enabled)
      mockCheckpointBuilder = mock<CheckpointBuilder>();
      mockCheckpointBuilder.buildBlock.mockImplementation(() => Promise.resolve(blockBuildResult));
      checkpointsBuilder.openCheckpoint.mockResolvedValue(mockCheckpointBuilder);
      worldState.fork.mockResolvedValue({
        close: () => Promise.resolve(),
        [Symbol.asyncDispose]: () => Promise.resolve(),
        getTreeInfo: () => Promise.resolve({ root: proposal.blockHeader.lastArchive.root.toBuffer() }),
      } as never);
    });

    it('should validate block proposal', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);
    });

    it('does not push a block proposal beyond a retained checkpoint terminal block to the archiver', async () => {
      validatorClient.updateConfig({ skipPushProposedBlocksToArchiver: false });
      validatorClient.getProposalHandler().register(p2pClient, true);

      const signer = Secp256k1Signer.random();
      const checkpointProposal = await makeCheckpointProposal({
        signer,
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: proposal.slotNumber }),
        archiveRoot: Fr.random(),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber, slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
      });
      const terminalBlock = checkpointProposal.getBlockProposal()!;

      const terminalGlobals = terminalBlock.blockHeader.globalVariables;
      const laterBlockHeader = makeBlockHeader(2, {
        lastArchive: new AppendOnlyTreeSnapshot(terminalBlock.archive, terminalBlock.blockNumber),
        blockNumber: BlockNumber(terminalBlock.blockNumber + 1),
        slotNumber: proposal.slotNumber,
        chainId: terminalGlobals.chainId,
        version: terminalGlobals.version,
        timestamp: terminalGlobals.timestamp,
        coinbase: terminalGlobals.coinbase,
        feeRecipient: terminalGlobals.feeRecipient,
        gasFees: terminalGlobals.gasFees,
      });
      const laterBlock = await makeBlockProposal({
        signer,
        blockHeader: laterBlockHeader,
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        archiveRoot: Fr.random(),
      });

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      p2pClient.getProposalsForSlot.mockResolvedValue({
        blockProposals: [terminalBlock, laterBlock],
        checkpointProposals: [checkpointProposal.toCore()],
      });

      const terminalBlockData = {
        header: terminalBlock.blockHeader,
        archive: new AppendOnlyTreeSnapshot(terminalBlock.archive, terminalBlock.blockNumber),
        blockHash: BlockHash.random(),
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: terminalBlock.indexWithinCheckpoint,
      } as unknown as BlockData;
      blockSource.getBlockData.mockImplementation(query =>
        Promise.resolve('number' in query ? undefined : terminalBlockData),
      );

      const blockAddedIfProcessed = {
        ...blockBuildResult.block,
        header: laterBlock.blockHeader,
        body: { txEffects: times(laterBlock.txHashes.length, () => TxEffect.empty()) },
        archive: new AppendOnlyTreeSnapshot(laterBlock.archive, laterBlock.blockNumber),
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: laterBlock.indexWithinCheckpoint,
      } as unknown as L2Block;
      mockCheckpointBuilder.buildBlock.mockResolvedValue({
        ...blockBuildResult,
        block: blockAddedIfProcessed,
        numTxs: laterBlock.txHashes.length,
      });
      worldState.fork.mockResolvedValue({
        close: () => Promise.resolve(),
        [Symbol.asyncDispose]: () => Promise.resolve(),
        getTreeInfo: () => Promise.resolve({ root: laterBlock.blockHeader.lastArchive.root.toBuffer() }),
      } as never);

      const result = await validatorClient.getProposalHandler().handleBlockProposal(laterBlock, sender, true);

      expect(result).toMatchObject({ isValid: false, reason: 'block_proposal_beyond_checkpoint' });
      expect(blockSource.addBlock).not.toHaveBeenCalled();
    });

    it('does not push a block proposal to the archiver when retained checkpoint proposals equivocate', async () => {
      validatorClient.updateConfig({ skipPushProposedBlocksToArchiver: false });
      validatorClient.getProposalHandler().register(p2pClient, true);

      const checkpointProposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: proposal.slotNumber }),
        archiveRoot: Fr.random(),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber, slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
      });
      const equivocatedCheckpointProposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(1, { slotNumber: proposal.slotNumber }),
        archiveRoot: Fr.random(),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber, slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
      });

      p2pClient.getProposalsForSlot.mockResolvedValue({
        blockProposals: [proposal],
        checkpointProposals: [checkpointProposal.toCore(), equivocatedCheckpointProposal.toCore()],
      });

      const result = await validatorClient.getProposalHandler().handleBlockProposal(proposal, sender, true);

      expect(result).toMatchObject({ isValid: false, reason: 'checkpoint_proposal_equivocation' });
      expect(blockSource.addBlock).not.toHaveBeenCalled();
    });

    it('uses the attestation deadline as the tx collection deadline for block proposals', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);

      const futureSlot = SlotNumber(proposal.slotNumber + 20);
      const futureProposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(1, {
          blockNumber,
          slotNumber: futureSlot,
        }),
        bucketRef: genesisBucketRef,
      });

      // Under pipelining, the target slot is the future slot the proposer is building for, built during
      // the previous slot. Position the wall clock at that build slot so the proposal falls within its
      // receive window and the attestation deadline is still in the future.
      const slotDuration = BigInt(checkpointsBuilder.getConfig().slotDuration);
      const futureBuildSlotTime = 1n + BigInt(futureSlot - 1) * slotDuration;
      dateProvider.setTime(Number(futureBuildSlotTime * 1000n));
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(futureSlot - 1),
        ts: futureBuildSlotTime,
        nowMs: futureBuildSlotTime * 1000n,
      });

      // The expected proposer for the target slot is whoever signed the future proposal.
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(futureProposal.getSender());
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: futureSlot,
        nextSlot: SlotNumber(futureSlot + 1),
      });

      const result = await validatorClient.getProposalHandler().handleBlockProposal(futureProposal, sender, false);

      expect(result.isValid).toBe(true);
      expect(txProvider.getTxsForBlockProposal).toHaveBeenCalledWith(
        futureProposal,
        blockNumber,
        expect.objectContaining({
          pinnedPeer: sender,
          // The consensus attestation deadline for the target slot.
          deadline: getExpectedAttestationDeadline(futureSlot),
        }),
      );
    });

    it('should process block proposal from own validator key (HA peer)', async () => {
      const selfSigner = new Secp256k1Signer(Buffer32.fromString(validatorPrivateKeys[0]));
      const selfProposal = await makeBlockProposal({
        blockHeader: proposal.blockHeader,
        archiveRoot: proposal.archive,
        txHashes: proposal.txHashes,
        signer: selfSigner,
        bucketRef: genesisBucketRef,
      });

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(selfSigner.address);

      const handleSpy = jest.spyOn(validatorClient.getProposalHandler(), 'handleBlockProposal');
      const isValid = await validatorClient.validateBlockProposal(selfProposal, sender);
      expect(isValid).toBe(true);
      expect(handleSpy).toHaveBeenCalled();
    });

    it('should return early when escape hatch is open', async () => {
      epochCache.isEscapeHatchOpenAtSlot.mockResolvedValueOnce(true);

      const handleSpy = jest.spyOn(validatorClient.getProposalHandler(), 'handleBlockProposal');

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

    it('should not attest to a checkpoint proposal after validating a block for that slot if the fee asset price modifier is invalid', async () => {
      const addCheckpointAttestationsSpy = jest.spyOn(p2pClient, 'addOwnCheckpointAttestations');

      const didValidate = await validatorClient.validateBlockProposal(proposal, sender);
      expect(didValidate).toBe(true);

      const attestationsNegative = await validatorClient.attestToCheckpointProposal(
        await makeCheckpointProposal({
          archiveRoot: proposal.archive,
          checkpointHeader: makeCheckpointHeader(0, { slotNumber: proposal.slotNumber }),
          lastBlock: {
            blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(123), slotNumber: proposal.slotNumber }),
            indexWithinCheckpoint: IndexWithinCheckpoint(0),
            txHashes: proposal.txHashes,
          },
          feeAssetPriceModifier: -MAX_FEE_ASSET_PRICE_MODIFIER_BPS - 1n,
        }),
        sender,
      );

      expect(attestationsNegative).toBeUndefined();
      expect(addCheckpointAttestationsSpy).not.toHaveBeenCalled();

      const attestationsPositive = await validatorClient.attestToCheckpointProposal(
        await makeCheckpointProposal({
          archiveRoot: proposal.archive,
          checkpointHeader: makeCheckpointHeader(0, { slotNumber: proposal.slotNumber }),
          lastBlock: {
            blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(123), slotNumber: proposal.slotNumber }),
            indexWithinCheckpoint: IndexWithinCheckpoint(0),
            txHashes: proposal.txHashes,
          },
          feeAssetPriceModifier: MAX_FEE_ASSET_PRICE_MODIFIER_BPS + 1n,
        }),
        sender,
      );

      expect(attestationsPositive).toBeUndefined();
      expect(addCheckpointAttestationsSpy).not.toHaveBeenCalled();
    });

    it('should attest to a checkpoint proposal after validating a block for that slot', async () => {
      const addCheckpointAttestationsSpy = jest.spyOn(p2pClient, 'addOwnCheckpointAttestations');
      const uploadBlobsSpy = jest.spyOn(
        validatorClient.getProposalHandler() as TestProposalHandler,
        'tryUploadBlobsForCheckpoint',
      );

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

      // Mock validateCheckpointProposal to pass, so handleCheckpointProposal runs its
      // own checks (signature, fee modifier) and then proceeds to blob upload.
      const validateCheckpointSpy = jest
        .spyOn(validatorClient.getProposalHandler(), 'validateCheckpointProposal')
        .mockResolvedValue({ isValid: true, checkpointNumber: CheckpointNumber(1) });

      // Enable blob upload for this attestation
      blobClient.canUpload.mockReturnValue(true);

      const attestations = await validatorClient.attestToCheckpointProposal(checkpointProposal, sender);

      expect(attestations).toBeDefined();
      expect(attestations).toHaveLength(1);
      expect(addCheckpointAttestationsSpy).toHaveBeenCalledTimes(1);
      expect(uploadBlobsSpy).toHaveBeenCalled();

      uploadBlobsSpy.mockRestore();
      validateCheckpointSpy.mockRestore();
    });

    it('should not attest to a checkpoint proposal that references a middle block instead of the last', async () => {
      const addCheckpointAttestationsSpy = jest.spyOn(p2pClient, 'addOwnCheckpointAttestations');

      // First validate a block proposal so the validator has seen a block for this slot
      const didValidate = await validatorClient.validateBlockProposal(proposal, sender);
      expect(didValidate).toBe(true);

      // Create 3 blocks for the slot, each with a distinct archive root
      const block1Archive = new AppendOnlyTreeSnapshot(Fr.random(), 1);
      const block2Archive = new AppendOnlyTreeSnapshot(Fr.random(), 2);
      const block3Archive = new AppendOnlyTreeSnapshot(Fr.random(), 3);
      const blocks = [
        { archive: block1Archive, number: 1 },
        { archive: block2Archive, number: 2 },
        { archive: block3Archive, number: 3 },
      ] as unknown as L2Block[];

      // Proposal references the middle block's archive (block 2), not the last (block 3)
      const checkpointProposal = await makeCheckpointProposal({
        archiveRoot: block2Archive.root,
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: proposal.slotNumber }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(2), slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(1),
          txHashes: proposal.txHashes,
        },
      });

      // Mock getBlockData to return block data so retryUntil succeeds
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as any);
      blockSource.getBlocksForSlot.mockResolvedValue(blocks);

      // Checkpoint validation should fail: proposal points to block 2 but last block in slot is block 3
      const attestations = await validatorClient.attestToCheckpointProposal(checkpointProposal, sender);
      expect(attestations).toBeUndefined();
      expect(addCheckpointAttestationsSpy).not.toHaveBeenCalled();
    });

    it('should wait for previous block to sync', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      // The proposal targets slot 100, which under pipelining is built during slot 99. Set the wall
      // clock to the start of the build slot so the reexecution deadline (start of the target slot)
      // is still in the future, leaving a retry window for the parent-block archive lookup.
      const buildSlotTime = 1n + BigInt(proposal.slotNumber - 1) * BigInt(checkpointsBuilder.getConfig().slotDuration);
      dateProvider.setTime(Number(buildSlotTime * 1000n));
      blockSource.getBlockData.mockResolvedValueOnce(undefined);
      blockSource.getBlockData.mockResolvedValueOnce(undefined);
      blockSource.getBlockData.mockResolvedValueOnce(undefined);
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      // Archive lookups: 1 direct + 2 retryUntil (undefined) + 1 retryUntil (success) = 4
      // Plus 1 number-based existence check after parent block is found = 5 total
      expect(blockSource.getBlockData).toHaveBeenCalledTimes(5);
      expect(isValid).toBe(true);
    });

    it('should re-execute and validate proposal', async () => {
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(true);
    });

    it('should not validate proposal if roots do not match and should emit WANT_TO_SLASH_EVENT', async () => {
      // Block builder returns a block with a different root
      const emitSpy = jest.spyOn(validatorClient, 'emit');
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
      blockBuildResult.block.archive.root = Fr.random();

      // Proposal should be invalid
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    it('should not validate proposal if the proposed block number is taken', async () => {
      // Parent block lookup (by archive) returns valid data; existence check (by number) returns a block
      // with the same archive as the proposal → a genuine duplicate, so the number is taken.
      blockSource.getBlockData.mockImplementation(query =>
        Promise.resolve(
          'number' in query
            ? ({ header: {} as BlockHeader, archive: { root: proposal.archive } } as any)
            : parentBlockData,
        ),
      );
      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
      expect(blockSource.getBlockData).toHaveBeenCalledWith({ number: blockNumber });
    });

    it('emits zero-amount invalid block proposal offenses when the penalty is zero', async () => {
      validatorClient.updateConfig({ slashBroadcastedInvalidBlockPenalty: 0n });

      const emitSpy = jest.spyOn(validatorClient, 'emit');
      blockBuildResult.block.archive.root = Fr.random();

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      const proposer = proposal.getSender();
      expect(isValid).toBe(false);
      expect(proposer).toBeDefined();
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: proposer!,
          amount: 0n,
          offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
          epochOrSlot: expect.any(BigInt),
        },
      ]);
    });

    it('marks invalid block proposal slots for delayed attestation slashing', async () => {
      blockBuildResult.block.archive.root = Fr.random();

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);

      expect(isValid).toBe(false);
      expect(validatorClient.hasInvalidProposals(proposal.slotNumber)).toBe(true);
    });

    it('emits invalid block proposal offense for oversized proposals, deduped per proposer and slot', async () => {
      await validatorClient.registerHandlers();
      const oversizedProposalCallback = p2pClient.registerOversizedProposalCallback.mock.calls[0][0];
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      const info = { slot: proposal.slotNumber, proposer: proposal.getSender()! };
      oversizedProposalCallback(info);
      oversizedProposalCallback(info);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: info.proposer,
          amount: config.slashBroadcastedInvalidBlockPenalty,
          offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
          epochOrSlot: BigInt(proposal.slotNumber),
        },
      ]);
    });

    it('records proposal equivocation and emits clear event', async () => {
      await validatorClient.registerHandlers();
      const duplicateProposalCallback = p2pClient.registerDuplicateProposalCallback.mock.calls[0][0];
      const emitSpy = jest.spyOn(validatorClient, 'emit');
      blockBuildResult.block.archive.root = Fr.random();

      await validatorClient.validateBlockProposal(proposal, sender);
      duplicateProposalCallback({
        slot: proposal.slotNumber,
        proposer: proposal.getSender()!,
        type: 'block',
      });

      expect(validatorClient.hasProposalEquivocation(proposal.slotNumber)).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_CLEAR_SLASH_EVENT, [
        {
          offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
          epochOrSlot: BigInt(proposal.slotNumber),
        },
      ]);
    });

    it('marks invalid proposal slots when the bad attestation penalty is zero', async () => {
      validatorClient.updateConfig({
        slashBroadcastedInvalidBlockPenalty: 0n,
        slashAttestInvalidCheckpointProposalPenalty: 0n,
      });
      blockBuildResult.block.archive.root = Fr.random();

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);

      expect(isValid).toBe(false);
      expect(validatorClient.hasInvalidProposals(proposal.slotNumber)).toBe(true);
    });

    it('reexecutes for bad attestation slashing when invalid block proposer slashing is disabled', async () => {
      validatorClient.updateConfig({ slashBroadcastedInvalidBlockPenalty: 0n });
      epochCache.filterInCommittee.mockResolvedValue([]);
      blockBuildResult.block.archive.root = Fr.random();

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);

      expect(isValid).toBe(false);
      expect(checkpointsBuilder.openCheckpoint).toHaveBeenCalled();
    });

    it('emits zero-amount bad attestation offenses when the bad attestation penalty is zero', async () => {
      await validatorClient.registerHandlers();
      const attestationCallback = p2pClient.registerCheckpointAttestationCallback.mock.calls[0][0];
      validatorClient.updateConfig({
        slashBroadcastedInvalidBlockPenalty: 0n,
        slashAttestInvalidCheckpointProposalPenalty: 0n,
      });
      const emitSpy = jest.spyOn(validatorClient, 'emit');
      const attesterSigner = Secp256k1Signer.random();
      const attestation = makeCheckpointAttestation({
        header: makeCheckpointHeader(1, { slotNumber: proposal.slotNumber }),
        attesterSigner,
      });
      blockBuildResult.block.archive.root = Fr.random();

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      attestationCallback(attestation);

      expect(isValid).toBe(false);
      expect(getAttestedToInvalidCheckpointProposalSlashEvents(emitSpy)).toEqual([
        [
          WANT_TO_SLASH_EVENT,
          [
            {
              validator: attesterSigner.address,
              amount: 0n,
              offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
              epochOrSlot: BigInt(proposal.slotNumber),
            },
          ],
        ],
      ]);
    });

    it('emits WANT_TO_SLASH_EVENT for checkpoint_header_mismatch checkpoint proposals', async () => {
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal, disposeFork } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      const proposer = checkpointProposal.getSender();
      expect(proposer).toBeDefined();
      expect(disposeFork).toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: proposer!,
          amount: config.slashBroadcastedInvalidCheckpointProposalPenalty,
          offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
          epochOrSlot: BigInt(checkpointProposal.slotNumber),
        },
      ]);
    });

    it('emits WANT_TO_SLASH_EVENT for invalid fee asset price modifiers', async () => {
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const checkpointProposal = await makeCheckpointProposal({
        archiveRoot: proposal.archive,
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: proposal.slotNumber }),
        lastBlock: {
          blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(123), slotNumber: proposal.slotNumber }),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
          txHashes: proposal.txHashes,
        },
        feeAssetPriceModifier: MAX_FEE_ASSET_PRICE_MODIFIER_BPS + 1n,
      });
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      const proposer = checkpointProposal.getSender();
      expect(proposer).toBeDefined();
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: proposer!,
          amount: config.slashBroadcastedInvalidCheckpointProposalPenalty,
          offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
          epochOrSlot: BigInt(checkpointProposal.slotNumber),
        },
      ]);
    });

    it.each<CheckpointProposalValidationFailureReason>([
      'archive_mismatch',
      'out_hash_mismatch',
      'last_block_archive_mismatch',
      'checkpoint_validation_failed',
    ])('emits checkpoint proposal slash event for %s', async reason => {
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const checkpointProposal = await makeCheckpointProposalForSlot();
      jest.spyOn(validatorClient.getProposalHandler(), 'handleCheckpointProposal').mockResolvedValue({
        isValid: false,
        reason,
      });
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      const proposer = checkpointProposal.getSender();
      expect(proposer).toBeDefined();
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: proposer!,
          amount: config.slashBroadcastedInvalidCheckpointProposalPenalty,
          offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
          epochOrSlot: BigInt(checkpointProposal.slotNumber),
        },
      ]);
    });

    it('emits zero-amount checkpoint proposal offenses when the penalty is zero', async () => {
      validatorClient.updateConfig({ slashBroadcastedInvalidCheckpointProposalPenalty: 0n });
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);
      const attestations = await validatorClient.attestToCheckpointProposal(checkpointProposal, sender);

      expect(attestations).toBeUndefined();
      expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toEqual([
        [
          WANT_TO_SLASH_EVENT,
          [
            {
              validator: checkpointProposal.getSender()!,
              amount: 0n,
              offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
              epochOrSlot: BigInt(checkpointProposal.slotNumber),
            },
          ],
        ],
      ]);
    });

    it.each<CheckpointProposalValidationFailureReason>(['last_block_not_found', 'checkpoint_already_published'])(
      'does not emit checkpoint proposal slash event for %s',
      async reason => {
        const checkpointHandler = registerAllNodesCheckpointHandler();
        const checkpointProposal = await makeCheckpointProposalForSlot();
        jest.spyOn(validatorClient.getProposalHandler(), 'handleCheckpointProposal').mockResolvedValue({
          isValid: false,
          reason,
        });
        const emitSpy = jest.spyOn(validatorClient, 'emit');

        await checkpointHandler(checkpointProposal, sender);

        expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toHaveLength(0);
      },
    );

    it('emits checkpoint proposal slash event once for repeated invalid proposals', async () => {
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);
      await checkpointHandler(checkpointProposal, sender);

      expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toHaveLength(1);
    });

    it('marks invalid checkpoint proposal slots for delayed attestation slashing', async () => {
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();

      await checkpointHandler(checkpointProposal, sender);

      expect(validatorClient.hasInvalidProposals(checkpointProposal.slotNumber)).toBe(true);
    });

    it('marks invalid checkpoint proposal slots when proposer slashing is disabled', async () => {
      validatorClient.updateConfig({ slashBroadcastedInvalidCheckpointProposalPenalty: 0n });
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toEqual([
        [
          WANT_TO_SLASH_EVENT,
          [
            {
              validator: checkpointProposal.getSender()!,
              amount: 0n,
              offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
              epochOrSlot: BigInt(checkpointProposal.slotNumber),
            },
          ],
        ],
      ]);
      expect(validatorClient.hasInvalidProposals(checkpointProposal.slotNumber)).toBe(true);
    });

    it('records checkpoint proposal equivocation and emits clear event', async () => {
      await validatorClient.registerHandlers();
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const duplicateProposalCallback = p2pClient.registerDuplicateProposalCallback.mock.calls[0][0];
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);
      duplicateProposalCallback({
        slot: checkpointProposal.slotNumber,
        proposer: checkpointProposal.getSender()!,
        type: 'checkpoint',
      });

      expect(validatorClient.hasProposalEquivocation(checkpointProposal.slotNumber)).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_CLEAR_SLASH_EVENT, [
        {
          offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
          epochOrSlot: BigInt(checkpointProposal.slotNumber),
        },
      ]);
    });

    it('does not mark invalid proposal slots after a non-slashable invalid checkpoint proposal', async () => {
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const checkpointProposal = await makeCheckpointProposalForSlot();
      jest.spyOn(validatorClient.getProposalHandler(), 'handleCheckpointProposal').mockResolvedValue({
        isValid: false,
        reason: 'last_block_not_found',
      });

      await checkpointHandler(checkpointProposal, sender);

      expect(validatorClient.hasInvalidProposals(checkpointProposal.slotNumber)).toBe(false);
    });

    it('emits slash event even if validator is not in the current committee', async () => {
      epochCache.filterInCommittee.mockResolvedValue([]);
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toHaveLength(1);
    });

    it('emits checkpoint proposal slash event in fisherman mode', async () => {
      validatorClient.updateConfig({ fishermanMode: true });
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toHaveLength(1);
    });

    it('does not emit checkpoint proposal slash event while escape hatch is open', async () => {
      epochCache.isEscapeHatchOpenAtSlot.mockResolvedValue(true);
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toHaveLength(0);
    });

    it('does not emit checkpoint proposal slash event when checkpoint validation is skipped', async () => {
      validatorClient.updateConfig({ skipCheckpointProposalValidation: true });
      const checkpointHandler = registerAllNodesCheckpointHandler();
      const { checkpointProposal } = await makeCheckpointProposalWithHeaderMismatch();
      const emitSpy = jest.spyOn(validatorClient, 'emit');

      await checkpointHandler(checkpointProposal, sender);

      expect(getBroadcastedInvalidCheckpointProposalSlashEvents(emitSpy)).toHaveLength(0);
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

      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: proposal.slotNumber,
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
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(proposal.slotNumber + 20),
        nextSlot: SlotNumber(proposal.slotNumber + 21),
      });
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(proposal.slotNumber + 20),
        ts: 0n,
        nowMs: 0n,
      });
      // Keep the wall-clock slot consistent with the "now" set above so the always-on pipelining
      // acceptance window correctly treats the proposal's slot as stale (not the current slot).
      epochCache.getSlotNow.mockReturnValue(SlotNumber(proposal.slotNumber + 20));
      epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(proposal.slotNumber + 20),
        ts: 0n,
        nowSeconds: 0n,
      });
      epochCache.getTargetSlot.mockReturnValue(SlotNumber(proposal.slotNumber + 20));
      epochCache.getTargetEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(proposal.slotNumber + 21),
        ts: 0n,
        nowSeconds: 0n,
      });

      const isValid = await validatorClient.validateBlockProposal(proposal, sender);
      expect(isValid).toBe(false);
    });

    describe('non-first block in checkpoint validation', () => {
      // When indexWithinCheckpoint > 0, global variables must match parent block (except blockNumber).

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

        const proposalBlockHeader = makeBlockHeader(1, {
          blockNumber: BlockNumber(parentBlockNumber + 1),
          slotNumber: SlotNumber(parentSlotNumber),
        });
        // Override the global variables on the block header
        (proposalBlockHeader as any).globalVariables = proposalGlobalVariables;

        const nonFirstBlockProposal = await makeBlockProposal({
          blockHeader: proposalBlockHeader,
          indexWithinCheckpoint: IndexWithinCheckpoint(1), // Non-first block in checkpoint
        });

        // Update epochCache mock for the new proposal
        epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(nonFirstBlockProposal.getSender());
        epochCache.getTargetAndNextSlot.mockReturnValue({
          targetSlot: nonFirstBlockProposal.slotNumber,
          nextSlot: SlotNumber(nonFirstBlockProposal.slotNumber + 1),
        });
        // Position the wall clock at the target slot's build slot (target_slot_start - S) so the
        // proposal falls within its receive window and reaches the global-variables check.
        const buildSlotTime =
          1n + BigInt(nonFirstBlockProposal.slotNumber - 1) * BigInt(checkpointsBuilder.getConfig().slotDuration);
        epochCache.getEpochAndSlotNow.mockReturnValue({
          epoch: EpochNumber(1),
          slot: SlotNumber(nonFirstBlockProposal.slotNumber - 1),
          ts: buildSlotTime,
          nowMs: buildSlotTime * 1000n,
        });
        epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
          epoch: EpochNumber(1),
          slot: SlotNumber(nonFirstBlockProposal.slotNumber - 1),
          ts: buildSlotTime,
          nowSeconds: buildSlotTime,
        });
        epochCache.getTargetSlot.mockReturnValue(nonFirstBlockProposal.slotNumber);
        epochCache.getTargetEpochAndSlotInNextL1Slot.mockReturnValue({
          epoch: EpochNumber(1),
          slot: SlotNumber(nonFirstBlockProposal.slotNumber + 1),
          ts: buildSlotTime,
          nowSeconds: buildSlotTime,
        });

        // Mock parent block data returned by getBlockData
        blockSource.getBlockData.mockResolvedValue({
          header: {
            getBlockNumber: () => BlockNumber(parentBlockNumber),
            getSlot: () => SlotNumber(parentSlotNumber),
            globalVariables: parentGlobalVariables,
          },
          archive: new AppendOnlyTreeSnapshot(Fr.random(), parentBlockNumber),
          blockHash: BlockHash.random(),
          checkpointNumber: parentCheckpointNumber,
          indexWithinCheckpoint: IndexWithinCheckpoint(0), // Parent is first block in checkpoint
        } as unknown as BlockData);

        // Set time to the target slot's build slot so the reexecution deadline is still in the future.
        dateProvider.setTime(Number(buildSlotTime * 1000n));

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
    });

    it('should validate proposals in fisherman mode but not create or broadcast attestations', async () => {
      // Enable fisherman mode (which also triggers re-execution)
      validatorClient.updateConfig({ fishermanMode: true });

      // Enable re-execution (required in fisherman mode)

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

  describe('uploadBlobsForCheckpoint', () => {
    const proposalInfo = { slotNumber: 1, archive: '0x00', proposer: '0x00', txCount: 0 };

    it('should send blobs from blocks in the slot to filestore', async () => {
      const mockBlock = L2Block.empty();
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as any);
      blockSource.getBlocksForSlot.mockResolvedValue([mockBlock]);

      const proposal = await makeCheckpointProposal({ lastBlock: {} });
      await (validatorClient.getProposalHandler() as TestProposalHandler).uploadBlobsForCheckpoint(
        proposal,
        proposalInfo,
      );

      expect(blockSource.getBlocksForSlot).toHaveBeenCalledWith(proposal.slotNumber);
      expect(blobClient.sendBlobsToFilestore).toHaveBeenCalled();
    });

    it('should not upload if last block header is not found', async () => {
      blockSource.getBlockData.mockResolvedValue(undefined);

      const proposal = await makeCheckpointProposal({ lastBlock: {} });
      await (validatorClient.getProposalHandler() as TestProposalHandler).uploadBlobsForCheckpoint(
        proposal,
        proposalInfo,
      );

      expect(blobClient.sendBlobsToFilestore).not.toHaveBeenCalled();
    });

    it('should not throw when blob upload fails', async () => {
      const mockBlock = L2Block.empty();
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as any);
      blockSource.getBlocksForSlot.mockResolvedValue([mockBlock]);
      blobClient.sendBlobsToFilestore.mockRejectedValue(new Error('upload failed'));

      const proposal = await makeCheckpointProposal({ lastBlock: {} });
      await expect(
        (validatorClient.getProposalHandler() as TestProposalHandler).uploadBlobsForCheckpoint(proposal, proposalInfo),
      ).resolves.toBeUndefined();
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

  describe('reloadKeystore', () => {
    // build a KeystoreManager from a single-validator KeyStore and reload.
    const reloadWith = (overrides: Parameters<typeof makeKeyStore>[0]) => {
      const manager = new KeystoreManager(makeKeyStore(overrides));
      validatorClient.reloadKeystore(manager);
      return manager;
    };

    const allKeys = () => config.validatorPrivateKeys!.getValue().map(k => k as Hex<32>);

    it('should update coinbase after reload', () => {
      const newCoinbase = EthAddress.random();
      reloadWith({ attester: allKeys(), coinbase: newCoinbase });

      const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).toEqual(newCoinbase);
    });

    it('should update fee recipient after reload', async () => {
      const newFeeRecipient = await AztecAddress.random();
      reloadWith({ attester: allKeys(), feeRecipient: newFeeRecipient });

      const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);
      expect(validatorClient.getFeeRecipientForAttestor(attestorAddress)).toEqual(newFeeRecipient);
    });

    it('should add new validator after reload', () => {
      const newPrivateKey = generatePrivateKey();
      const newAccount = privateKeyToAccount(newPrivateKey);
      reloadWith({ attester: [...allKeys(), newPrivateKey as Hex<32>] });

      const addresses = validatorClient.getValidatorAddresses();
      expect(addresses).toHaveLength(3);
      expect(addresses.some(a => a.equals(EthAddress.fromString(newAccount.address)))).toBe(true);
    });

    it('should update attester key after reload', () => {
      const newPrivateKey = generatePrivateKey();
      const newAccount = privateKeyToAccount(newPrivateKey);
      reloadWith({ attester: newPrivateKey as Hex<32> });

      const addresses = validatorClient.getValidatorAddresses();
      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toEqual(EthAddress.fromString(newAccount.address));
    });

    it('should remove a validator after reload', () => {
      const remainingKey = config.validatorPrivateKeys!.getValue()[0] as Hex<32>;
      const removedAccount = validatorAccounts[1];
      reloadWith({ attester: remainingKey });

      const addresses = validatorClient.getValidatorAddresses();
      expect(addresses).toHaveLength(1);
      expect(addresses.some(a => a.equals(EthAddress.fromString(removedAccount.address)))).toBe(false);

      // Accessing the removed validator's coinbase should throw
      expect(() => validatorClient.getCoinbaseForAttestor(EthAddress.fromString(removedAccount.address))).toThrow(
        /not found in any validator configuration/,
      );
    });

    it('should change coinbase and no longer return the old one', () => {
      const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);

      const oldCoinbase = EthAddress.random();
      reloadWith({ attester: allKeys(), coinbase: oldCoinbase });
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).toEqual(oldCoinbase);

      const newCoinbase = EthAddress.random();
      reloadWith({ attester: allKeys(), coinbase: newCoinbase });
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).toEqual(newCoinbase);
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).not.toEqual(oldCoinbase);
    });

    it('should reset coinbase to attester fallback when removed', () => {
      const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);

      const explicitCoinbase = EthAddress.random();
      reloadWith({ attester: allKeys(), coinbase: explicitCoinbase });
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).toEqual(explicitCoinbase);

      // Reload without coinbase — falls back to the attester address itself
      reloadWith({ attester: allKeys() });
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).toEqual(attestorAddress);
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).not.toEqual(explicitCoinbase);
    });

    it('should change fee recipient and no longer return the old one', async () => {
      const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);

      const oldFeeRecipient = await AztecAddress.random();
      reloadWith({ attester: allKeys(), feeRecipient: oldFeeRecipient });
      expect(validatorClient.getFeeRecipientForAttestor(attestorAddress)).toEqual(oldFeeRecipient);

      const newFeeRecipient = await AztecAddress.random();
      reloadWith({ attester: allKeys(), feeRecipient: newFeeRecipient });
      expect(validatorClient.getFeeRecipientForAttestor(attestorAddress)).toEqual(newFeeRecipient);
      expect(validatorClient.getFeeRecipientForAttestor(attestorAddress)).not.toEqual(oldFeeRecipient);
    });

    it('should preserve HA signer and wrap new adapter in HAKeyStore after reload', () => {
      // Simulate HA mode by setting the haSigner and wrapping in HAKeyStore
      const mockHASigner = { nodeId: 'test-ha-node' };
      (validatorClient as any).slashingProtectionSigner = mockHASigner;
      (validatorClient as any).keyStore = haKeyStore;

      const newCoinbase = EthAddress.random();
      reloadWith({ attester: allKeys(), coinbase: newCoinbase });

      // Verify the keyStore is an HAKeyStore wrapping the same haSigner
      const keyStoreAfterReload = (validatorClient as any).keyStore;
      expect(keyStoreAfterReload).toBeInstanceOf(HAKeyStore);
      expect((keyStoreAfterReload as any).haSigner).toBe(mockHASigner);

      // Verify the new coinbase is accessible through the HAKeyStore
      const attestorAddress = EthAddress.fromString(validatorAccounts[0].address);
      expect(validatorClient.getCoinbaseForAttestor(attestorAddress)).toEqual(newCoinbase);
    });
  });
});

/** Exposes protected methods for direct testing */
class TestProposalHandler extends ProposalHandler {
  declare public uploadBlobsForCheckpoint: (
    ...args: Parameters<ProposalHandler['uploadBlobsForCheckpoint']>
  ) => Promise<void>;
  declare public tryUploadBlobsForCheckpoint: (
    ...args: Parameters<ProposalHandler['tryUploadBlobsForCheckpoint']>
  ) => void;
}

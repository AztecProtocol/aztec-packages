import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type Blob, getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import type { CheckpointProposedLog, InboxContract, MessageSentLog, RollupContract } from '@aztec/ethereum/contracts';
import { MULTI_CALL_3_ADDRESS } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { type BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';
import { CommitteeAttestation, CommitteeAttestationsAndSigners, L2Block } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { getSlotAtTimestamp } from '@aztec/stdlib/epoch-helpers';
import { updateInboxRollingHash } from '@aztec/stdlib/messaging';
import { ConsensusPayload, getHashedSignaturePayloadTypedData } from '@aztec/stdlib/p2p';
import { mockCheckpointAndMessages } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';

import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type AbiParameter,
  type FormattedBlock,
  type Transaction,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  multicall3Abi,
  toHex,
} from 'viem';

/** Configuration for the fake L1 state. */
export type FakeL1StateConfig = {
  /** Genesis archive root. */
  genesisArchiveRoot: Fr;
  /** L1 start block number. */
  l1StartBlock: bigint;
  /** L1 genesis time in seconds. */
  l1GenesisTime: bigint;
  /** Ethereum slot duration in seconds. */
  ethereumSlotDuration: number;
  /** Rollup address for mock contracts. */
  rollupAddress: EthAddress;
  /** Inbox address for mock contracts. */
  inboxAddress: EthAddress;
  /** Aztec slot duration in seconds */
  slotDuration: number;
};

/** Options for adding a checkpoint. */
type AddCheckpointOptions = {
  /** L1 block number where checkpoint was proposed. */
  l1BlockNumber: bigint;
  /** Number of L2 blocks in the checkpoint. Default: 1 */
  numBlocks?: number;
  /** Or the actual blocks for the checkpoint */
  blocks?: L2Block[];
  /** Number of transactions per block. Default: 4 */
  txsPerBlock?: number;
  /** Max number of effects per tx (for generating large blobs). Default: undefined */
  maxEffects?: number;
  /** Signers for attestations. Default: none */
  signers?: Secp256k1Signer[];
  /** Override slot number. */
  slotNumber?: SlotNumber;
  /** Override previous archive. */
  previousArchive?: AppendOnlyTreeSnapshot;
  /** Timestamp for the checkpoint. */
  timestamp?: bigint;
  /** Number of L1-to-L2 messages. Default: 3 */
  numL1ToL2Messages?: number;
  /** L1 block number where messages were sent. Default: l1BlockNumber - 3 */
  messagesL1BlockNumber?: bigint;
};

/** Result from adding a checkpoint. */
type AddCheckpointResult = {
  /** The checkpoint that was created. */
  checkpoint: Checkpoint;
  /** The L1-to-L2 messages for this checkpoint. */
  messages: Fr[];
};

/** Data stored for a checkpoint. */
type CheckpointData = {
  checkpointNumber: CheckpointNumber;
  checkpoint: Checkpoint;
  l1BlockNumber: bigint;
  tx: Transaction;
  blobHashes: `0x${string}`[];
  blobs: Blob[];
  signers: Secp256k1Signer[];
  /** Hash of the packed attestations, matching what the L1 event emits. */
  attestationsHash: Buffer32;
  /** Payload digest, matching what the L1 event emits. */
  payloadDigest: Buffer32;
  /** If true, archiveAt will ignore it */
  pruned?: boolean;
};

/** Data stored for a message. */
type MessageData = {
  l1BlockNumber: bigint;
  index: bigint;
  leaf: Fr;
  inboxRollingHash: Fr;
  bucketSeq: bigint;
};

// Mirror of the on-chain per-bucket message cap: further messages in the same L1 block spill into the next bucket.
const MAX_MSGS_PER_BUCKET = 256;

/**
 * Stateful fake for L1 data used by the archiver.
 *
 * This class simulates the L1 blockchain state that the archiver reads from:
 * - RollupContract: status(), archiveAt(), getVersion(), getTargetCommitteeSize(), CheckpointProposed events
 * - InboxContract: getState(), MessageSent events
 * - PublicClient: getBlockNumber(), getBlock(), getTransaction()
 * - BlobClient: getBlobSidecar()
 *
 * @example
 * ```ts
 * const fake = new FakeL1State(config);
 *
 * // Add checkpoint (creates messages automatically)
 * const { checkpoint, messages } = await fake.addCheckpoint(CheckpointNumber(1), { l1BlockNumber: 101n });
 * fake.setL1BlockNumber(105n);
 *
 * // Status auto-updated
 * expect(fake.getRollupStatus().pendingCheckpointNumber).toEqual(CheckpointNumber(1));
 * ```
 */
export class FakeL1State {
  private readonly log = createLogger('archiver:test:fake-l1');
  private l1BlockNumber: bigint;
  private checkpoints: CheckpointData[] = [];
  private messages: MessageData[] = [];
  // Consensus rolling-hash and bucket-ring state, mirroring the on-chain Inbox.
  private messagesConsensusRollingHash: Fr = Fr.ZERO;
  private currentBucketSeq: bigint = 0n;
  private currentBucketTimestamp: bigint = 0n;
  private currentBucketMsgCount: number = 0;
  private lastArchive: AppendOnlyTreeSnapshot;
  private provenCheckpointNumber: CheckpointNumber = CheckpointNumber(0);
  private targetCommitteeSize: number = 0;
  private version: bigint = 1n;
  private canPruneResult: boolean = false;

  // Computed from checkpoints based on L1 block visibility
  private pendingCheckpointNumber: CheckpointNumber = CheckpointNumber(0);

  // The L1 block number reported as "finalized" (defaults to the start block).
  // `undefined` simulates the startup window on a fresh devnet where
  // `getBlock({ blockTag: 'finalized' })` fails with "finalized block not found".
  private finalizedL1BlockNumber: bigint | undefined;

  constructor(private readonly config: FakeL1StateConfig) {
    this.l1BlockNumber = config.l1StartBlock;
    this.finalizedL1BlockNumber = config.l1StartBlock;
    this.lastArchive = new AppendOnlyTreeSnapshot(config.genesisArchiveRoot, 1);
  }

  /**
   * Adds messages for a checkpoint. Returns the message leaves.
   * Auto-updates rolling hash.
   *
   * Note: For most use cases, use `addCheckpoint` which creates both checkpoint and messages.
   * Use this method only when you need to add messages without creating a checkpoint (e.g., for reorg tests).
   */
  addMessages(_checkpointNumber: CheckpointNumber, l1BlockNumber: bigint, messageLeaves: Fr[]): void {
    const timestamp = this.getTimestampAtL1Block(l1BlockNumber);
    messageLeaves.forEach(leaf => {
      // Compact global insertion index: the position in the Inbox's insertion order.
      const index = BigInt(this.messages.length);
      const { bucketSeq, inboxRollingHash } = this.absorbIntoBucket(leaf, timestamp);

      this.messages.push({
        l1BlockNumber,
        index,
        leaf,
        inboxRollingHash,
        bucketSeq,
      });
    });
  }

  /** Mirrors the on-chain `_absorbIntoBucket`: opens a new bucket on a strictly larger timestamp or a full bucket. */
  private absorbIntoBucket(leaf: Fr, timestamp: bigint): { bucketSeq: bigint; inboxRollingHash: Fr } {
    if (
      this.currentBucketSeq === 0n ||
      this.currentBucketTimestamp < timestamp ||
      this.currentBucketMsgCount === MAX_MSGS_PER_BUCKET
    ) {
      this.currentBucketSeq += 1n;
      this.currentBucketTimestamp = timestamp;
      this.currentBucketMsgCount = 0;
    }
    this.messagesConsensusRollingHash = updateInboxRollingHash(this.messagesConsensusRollingHash, leaf);
    this.currentBucketMsgCount += 1;
    return { bucketSeq: this.currentBucketSeq, inboxRollingHash: this.messagesConsensusRollingHash };
  }

  /** Rebuilds all per-message derived state (rolling hashes and bucket assignments) after the message set changes. */
  private recomputeDerivedMessageState(): void {
    this.messagesConsensusRollingHash = Fr.ZERO;
    this.currentBucketSeq = 0n;
    this.currentBucketTimestamp = 0n;
    this.currentBucketMsgCount = 0;
    this.messages.forEach((msg, i) => {
      const { bucketSeq, inboxRollingHash } = this.absorbIntoBucket(
        msg.leaf,
        this.getTimestampAtL1Block(msg.l1BlockNumber),
      );
      msg.index = BigInt(i);
      msg.inboxRollingHash = inboxRollingHash;
      msg.bucketSeq = bucketSeq;
    });
  }

  /**
   * Creates blocks for a checkpoint without adding them to L1 state.
   * Useful for creating blocks to pass to addBlock() for testing provisional block handling.
   * Returns the blocks directly.
   */
  public async makeBlocks(checkpointNumber: CheckpointNumber, options: Partial<AddCheckpointOptions>) {
    return (await this.makeCheckpointAndMessages(checkpointNumber, options)).checkpoint.blocks;
  }

  /**
   * Creates and adds a checkpoint with its L1-to-L2 messages.
   * Returns both the checkpoint and the message leaves.
   * Auto-chains from lastArchive, auto-updates pending status if L1 block >= checkpoint's L1 block.
   */
  public async addCheckpoint(
    checkpointNumber: CheckpointNumber,
    options: AddCheckpointOptions,
  ): Promise<AddCheckpointResult> {
    this.log.warn(`Adding checkpoint ${checkpointNumber}`);

    const { l1BlockNumber, signers = [], messagesL1BlockNumber = l1BlockNumber - 3n } = options;

    // Create the checkpoint using the stdlib helper
    const { checkpoint, messages, lastArchive } = await this.makeCheckpointAndMessages(checkpointNumber, {
      ...options,
      numL1ToL2Messages: options.numL1ToL2Messages ?? 3,
    });

    // Store the messages internally so they match the checkpoint's inHash
    this.addMessages(checkpointNumber, messagesL1BlockNumber, messages);

    // Create the transaction, blobs, and event hashes
    const { tx, attestationsHash, payloadDigest } = await this.makeRollupTx(checkpoint, signers);
    const blobHashes = await this.makeVersionedBlobHashes(checkpoint);
    const blobs = await this.makeBlobsFromCheckpoint(checkpoint);

    // Store the checkpoint data
    this.checkpoints.push({
      checkpointNumber,
      checkpoint,
      l1BlockNumber,
      tx,
      blobHashes,
      blobs,
      signers,
      attestationsHash,
      payloadDigest,
    });

    // Update last archive for auto-chaining
    this.lastArchive = lastArchive ?? checkpoint.blocks.at(-1)!.archive;

    // Auto-update pending checkpoint number
    this.updatePendingCheckpointNumber();

    return { checkpoint, messages };
  }

  /** Creates a checkpoint and messages without adding them to L1 state. */
  private makeCheckpointAndMessages(checkpointNumber: CheckpointNumber, options: Partial<AddCheckpointOptions>) {
    const {
      numBlocks = 1,
      txsPerBlock = 4,
      maxEffects,
      slotNumber,
      previousArchive = this.lastArchive,
      timestamp,
      l1BlockNumber,
      numL1ToL2Messages = 0,
      blocks,
    } = options;

    return mockCheckpointAndMessages(checkpointNumber, {
      startBlockNumber: this.getNextBlockNumber(checkpointNumber),
      numBlocks,
      blocks,
      numTxsPerBlock: txsPerBlock,
      numL1ToL2Messages,
      previousArchive,
      slotNumber: slotNumber ?? (l1BlockNumber !== undefined ? this.getL2SlotAtL1Block(l1BlockNumber) : undefined),
      timestamp: timestamp ?? (l1BlockNumber !== undefined ? this.getTimestampAtL1Block(l1BlockNumber) : undefined),
      ...(maxEffects !== undefined ? { maxEffects } : {}),
    });
  }

  /** Returns the L2 slot at the given L1 block (assuming all L1 blocks are mined) */
  public getL2SlotAtL1Block(l1BlockNumber: bigint): SlotNumber {
    const timestamp = this.getTimestampAtL1Block(l1BlockNumber);
    return getSlotAtTimestamp(timestamp, this.config);
  }

  /** Returns the timestamp at the given L1 block (assuming all L1 blocks are mined) */
  public getTimestampAtL1Block(l1BlockNumber: bigint): bigint {
    const { l1GenesisTime, l1StartBlock, ethereumSlotDuration } = this.config;
    return l1GenesisTime + (l1BlockNumber - l1StartBlock) * BigInt(ethereumSlotDuration);
  }

  /**
   * Sets the current L1 block number.
   * Auto-updates pending checkpoint number based on visible checkpoints.
   */
  setL1BlockNumber(blockNumber: bigint): void {
    this.l1BlockNumber = blockNumber;
    this.updatePendingCheckpointNumber();
  }

  /**
   * Sets the L1 block number that will be reported as "finalized". Pass `undefined` to
   * simulate a chain that does not yet have a finalized block (devnet startup).
   */
  setFinalizedL1BlockNumber(blockNumber: bigint | undefined): void {
    this.finalizedL1BlockNumber = blockNumber;
  }

  /** Marks a checkpoint as proven. Updates provenCheckpointNumber. */
  markCheckpointAsProven(checkpointNumber: CheckpointNumber): void {
    this.provenCheckpointNumber = checkpointNumber;
  }

  /**
   * Simulates what `rollup.getProvenCheckpointNumber({ blockNumber: atL1Block })` would return.
   */
  getProvenCheckpointNumberAtL1Block(atL1Block: bigint): CheckpointNumber {
    if (this.provenCheckpointNumber === 0) {
      return CheckpointNumber(0);
    }
    const checkpoint = this.checkpoints.find(cp => cp.checkpointNumber === this.provenCheckpointNumber);
    if (checkpoint && checkpoint.l1BlockNumber <= atL1Block) {
      return this.provenCheckpointNumber;
    }
    return CheckpointNumber(0);
  }

  /** Sets the target committee size for attestation validation. */
  setTargetCommitteeSize(size: number): void {
    this.targetCommitteeSize = size;
  }

  /** Sets whether the rollup contract would allow pruning at the next block. */
  setCanPrune(value: boolean): void {
    this.canPruneResult = value;
  }

  /**
   * Removes all entries for a checkpoint number (simulates L1 reorg or prune).
   * Note: Does NOT remove messages for this checkpoint (use numL1ToL2Messages: 0 when re-adding).
   * Auto-updates pending status.
   */
  removeCheckpoint(checkpointNumber: CheckpointNumber): void {
    this.checkpoints = this.checkpoints.filter(cpData => cpData.checkpointNumber !== checkpointNumber);
    this.updatePendingCheckpointNumber();
  }

  /**
   * Moves a checkpoint to a different L1 block number (simulates L1 reorg that
   * re-includes the same checkpoint transaction in a different block).
   * The checkpoint content stays the same — only the L1 metadata changes.
   * Auto-updates pending status.
   */
  moveCheckpointToL1Block(checkpointNumber: CheckpointNumber, newL1BlockNumber: bigint): void {
    for (const cpData of this.checkpoints) {
      if (cpData.checkpointNumber === checkpointNumber) {
        cpData.l1BlockNumber = newL1BlockNumber;
      }
    }
    this.updatePendingCheckpointNumber();
  }

  /**
   * Removes messages after a given total index (simulates L1 reorg).
   * Auto-updates rolling hash.
   */
  removeMessagesAfter(totalIndex: number): void {
    this.messages = this.messages.slice(0, totalIndex);
    this.recomputeDerivedMessageState();
  }

  /**
   * Simulates a pruned checkpoint by marking all entries with this number as pruned.
   * The event will still be returned, but archiveAt() will return the previous checkpoint's archive
   * (or genesis if no previous checkpoint), causing a mismatch that the archiver will detect.
   */
  markCheckpointAsPruned(checkpointNumber: CheckpointNumber): void {
    for (const cpData of this.checkpoints) {
      if (cpData.checkpointNumber === checkpointNumber) {
        cpData.pruned = true;
      }
    }
    this.updatePendingCheckpointNumber();
  }

  /**
   * Moves messages at a given L1 block to a new L1 block.
   * Useful for simulating partial message visibility (messages at higher L1 blocks won't be fetched).
   */
  moveMessagesToL1Block(fromL1Block: bigint, toL1Block: bigint): void {
    this.messages.forEach(msg => {
      if (msg.l1BlockNumber === fromL1Block) {
        msg.l1BlockNumber = toL1Block;
      }
    });
  }

  /**
   * Moves a specific message (by index in the messages array) to a new L1 block.
   */
  moveMessageAtIndexToL1Block(index: number, toL1Block: bigint): void {
    if (this.messages[index]) {
      this.messages[index].l1BlockNumber = toL1Block;
    }
  }

  /** Gets current rollup status. */
  getRollupStatus(): {
    provenCheckpointNumber: CheckpointNumber;
    pendingCheckpointNumber: CheckpointNumber;
    provenArchive: Fr;
    pendingArchive: Fr;
  } {
    return {
      provenCheckpointNumber: this.provenCheckpointNumber,
      pendingCheckpointNumber: this.pendingCheckpointNumber,
      provenArchive: this.getArchiveAt(this.provenCheckpointNumber),
      pendingArchive: this.getArchiveAt(this.pendingCheckpointNumber),
    };
  }

  /** Gets the last archive (for manual chaining if needed). */
  getLastArchive(): AppendOnlyTreeSnapshot {
    return this.lastArchive;
  }

  /** Gets the latest checkpoint entry by number (returns the last added one). */
  getCheckpoint(checkpointNumber: CheckpointNumber): Checkpoint | undefined {
    return this.checkpoints.findLast(cpData => cpData.checkpointNumber === checkpointNumber)?.checkpoint;
  }

  /** Gets the blobs for a checkpoint. */
  getCheckpointBlobs(checkpointNumber: CheckpointNumber): Blob[] {
    return this.checkpoints.findLast(cpData => cpData.checkpointNumber === checkpointNumber)?.blobs ?? [];
  }

  /** Creates mock RollupContract that reads from this fake state. */
  createMockRollupContract(_publicClient: MockProxy<ViemPublicClient>): MockProxy<RollupContract> {
    const mockRollup = mock<RollupContract>();

    mockRollup.getVersion.mockImplementation(() => Promise.resolve(this.version));
    mockRollup.getTargetCommitteeSize.mockImplementation(() => Promise.resolve(this.targetCommitteeSize));
    mockRollup.archiveAt.mockImplementation((cpNum: CheckpointNumber) => Promise.resolve(this.getArchiveAt(cpNum)));
    mockRollup.status.mockImplementation((localCheckpointNum: CheckpointNumber) => {
      const status = this.getRollupStatus();
      return Promise.resolve({
        provenCheckpointNumber: status.provenCheckpointNumber,
        provenArchive: status.provenArchive,
        pendingCheckpointNumber: status.pendingCheckpointNumber,
        pendingArchive: status.pendingArchive,
        archiveOfMyCheckpoint: this.getArchiveAt(localCheckpointNum),
      });
    });

    mockRollup.getProvenCheckpointNumber.mockImplementation((options?: { blockNumber?: bigint }) => {
      const atBlock = options?.blockNumber ?? this.l1BlockNumber;
      return Promise.resolve(this.getProvenCheckpointNumberAtL1Block(atBlock));
    });

    mockRollup.canPruneAtTime.mockImplementation(() => Promise.resolve(this.canPruneResult));

    // Mock the wrapper method for fetching checkpoint events
    mockRollup.getCheckpointProposedEvents.mockImplementation((fromBlock: bigint, toBlock: bigint) =>
      Promise.resolve(this.getCheckpointProposedLogs(fromBlock, toBlock)),
    );

    Object.defineProperty(mockRollup, 'address', { get: () => this.config.rollupAddress.toString() });

    return mockRollup;
  }

  /** Creates mock InboxContract that reads from this fake state. */
  createMockInboxContract(_publicClient: MockProxy<ViemPublicClient>): MockProxy<InboxContract> {
    const mockInbox = mock<InboxContract>();

    mockInbox.getState.mockImplementation((opts: { blockTag?: string; blockNumber?: bigint } = {}) => {
      const blockNumber = opts.blockNumber ?? this.l1BlockNumber;
      const visibleMessages = this.messages.filter(m => m.l1BlockNumber <= blockNumber);
      return Promise.resolve({ totalMessagesInserted: BigInt(visibleMessages.length) });
    });

    // Mirror the on-chain Inbox current bucket: its consensus rolling hash and cumulative total are the live chain
    // position the archiver's message sync compares against.
    mockInbox.getCurrentBucket.mockImplementation((opts: { blockTag?: string; blockNumber?: bigint } = {}) => {
      const blockNumber = opts.blockNumber ?? this.l1BlockNumber;
      const visibleMessages = this.messages.filter(m => m.l1BlockNumber <= blockNumber);
      const last = visibleMessages.at(-1);
      if (last === undefined) {
        return Promise.resolve({ rollingHash: Fr.ZERO, totalMsgCount: 0n, timestamp: 0n, msgCount: 0 });
      }
      const msgCount = visibleMessages.filter(m => m.bucketSeq === last.bucketSeq).length;
      return Promise.resolve({
        rollingHash: last.inboxRollingHash,
        totalMsgCount: BigInt(visibleMessages.length),
        timestamp: this.getTimestampAtL1Block(last.l1BlockNumber),
        msgCount,
      });
    });

    // Mock the wrapper methods for fetching message events
    mockInbox.getMessageSentEvents.mockImplementation((fromBlock: bigint, toBlock: bigint) =>
      Promise.resolve(this.getMessageSentLogs(fromBlock, toBlock)),
    );

    mockInbox.getMessageSentEventByHash.mockImplementation((msgHash: string, aroundL1BlockNumber: bigint) =>
      Promise.resolve(this.getMessageSentLogByHash(msgHash, aroundL1BlockNumber) as MessageSentLog),
    );

    return mockInbox;
  }

  /** Creates mock PublicClient that reads from this fake state. */
  createMockPublicClient(): MockProxy<ViemPublicClient> {
    const publicClient = mock<ViemPublicClient>();

    publicClient.getChainId.mockResolvedValue(1);
    // Several consumers (CalldataRetriever, ArchiverL1Synchronizer) derive the EIP-712 signing
    // context from `publicClient.chain.id`. Pin it so it matches `getSignatureContext()` below.
    (publicClient as unknown as { chain: { id: number } }).chain = { id: 1 };
    publicClient.getBlockNumber.mockImplementation(() => Promise.resolve(this.l1BlockNumber));

    publicClient.getBlock.mockImplementation((async (args: { blockNumber?: bigint; blockTag?: string } = {}) => {
      let blockNum: bigint;
      if (args.blockTag === 'finalized') {
        if (this.finalizedL1BlockNumber === undefined) {
          throw Object.assign(new Error('finalized block not found'), {
            details: 'finalized block not found',
          });
        }
        blockNum = this.finalizedL1BlockNumber;
      } else {
        blockNum = args.blockNumber ?? (await publicClient.getBlockNumber());
      }
      return {
        number: blockNum,
        timestamp: BigInt(blockNum) * BigInt(this.config.ethereumSlotDuration) + this.config.l1GenesisTime,
        hash: Buffer32.fromBigInt(blockNum).toString(),
      } as FormattedBlock;
    }) as any);

    // Use the same pattern as existing test for getTransaction
    publicClient.getTransaction.mockImplementation((args: { hash?: `0x${string}` }) =>
      Promise.resolve(
        args.hash ? (this.checkpoints.find(cpData => cpData.tx.hash === args.hash)?.tx as any) : undefined,
      ),
    );

    return publicClient;
  }

  /** Creates mock BlobClient that reads from this fake state. */
  createMockBlobClient(): MockProxy<BlobClientInterface> {
    const blobClient = mock<BlobClientInterface>();

    // The blockId is the L1 block hash, which we derive from the L1 block number
    blobClient.getBlobSidecar.mockImplementation((blockId: `0x${string}`) =>
      Promise.resolve(
        this.checkpoints.find(cpData => Buffer32.fromBigInt(cpData.l1BlockNumber).toString() === blockId)?.blobs ?? [],
      ),
    );

    blobClient.testSources.mockResolvedValue(undefined);

    return blobClient;
  }

  private updatePendingCheckpointNumber(): void {
    this.pendingCheckpointNumber = this.checkpoints
      .filter(cpData => cpData.l1BlockNumber <= this.l1BlockNumber && !cpData.pruned)
      .reduce((max, cpData) => (cpData.checkpointNumber > max ? cpData.checkpointNumber : max), CheckpointNumber(0));
  }

  private getArchiveAt(checkpointNumber: CheckpointNumber): Fr {
    if (checkpointNumber === 0) {
      return this.config.genesisArchiveRoot;
    }
    // Find the latest non-pruned entry for this checkpoint number
    const entries = this.checkpoints.filter(cpData => cpData.checkpointNumber === checkpointNumber);
    const latestEntry = entries.at(-1);

    if (!latestEntry || latestEntry.pruned) {
      // For pruned or missing checkpoints, return the previous non-pruned checkpoint's archive
      return this.getArchiveAt(CheckpointNumber(checkpointNumber - 1));
    }
    return latestEntry.checkpoint.archive.root;
  }

  private getNextBlockNumber(checkpointNumber: CheckpointNumber): BlockNumber {
    const lastBlockNumber = this.checkpoints
      .filter(cpData => cpData.checkpointNumber < checkpointNumber)
      .flatMap(cpData => cpData.checkpoint.blocks.map(b => b.number))
      .reduce((max, num) => Math.max(max, num), 0);
    return (lastBlockNumber + 1) as BlockNumber;
  }

  private getCheckpointProposedLogs(fromBlock: bigint, toBlock: bigint): CheckpointProposedLog[] {
    return this.checkpoints
      .filter(cpData => cpData.l1BlockNumber >= fromBlock && cpData.l1BlockNumber <= toBlock)
      .map(cpData => ({
        l1BlockNumber: cpData.l1BlockNumber,
        l1BlockHash: Buffer32.fromBigInt(cpData.l1BlockNumber),
        l1TransactionHash: cpData.tx.hash as `0x${string}`,
        args: {
          checkpointNumber: cpData.checkpointNumber,
          archive: cpData.checkpoint.archive.root,
          versionedBlobHashes: cpData.blobHashes.map(h => Buffer.from(h.slice(2), 'hex')),
          attestationsHash: cpData.attestationsHash,
          payloadDigest: cpData.payloadDigest,
        },
      }));
  }

  private getMessageSentLogs(fromBlock?: bigint, toBlock?: bigint, hashFilter?: string): MessageSentLog[] {
    return this.messages
      .filter(
        msg =>
          (!hashFilter || msg.leaf.toString() === hashFilter) &&
          (!fromBlock || msg.l1BlockNumber >= fromBlock) &&
          (!toBlock || msg.l1BlockNumber <= toBlock),
      )
      .map(msg => ({
        l1BlockNumber: msg.l1BlockNumber,
        l1BlockHash: Buffer32.fromBigInt(msg.l1BlockNumber),
        l1TransactionHash: `0x${msg.l1BlockNumber.toString(16)}` as `0x${string}`,
        l1BlockTimestamp: this.getTimestampAtL1Block(msg.l1BlockNumber),
        args: {
          index: msg.index,
          leaf: msg.leaf,
          inboxRollingHash: msg.inboxRollingHash,
          bucketSeq: msg.bucketSeq,
        },
      }));
  }

  private getMessageSentLogByHash(msgHash: string, aroundL1BlockNumber: bigint): MessageSentLog | undefined {
    const msg = this.messages.find(
      msg =>
        msg.leaf.toString() === msgHash &&
        msg.l1BlockNumber >= aroundL1BlockNumber - 5n &&
        msg.l1BlockNumber <= aroundL1BlockNumber + 5n,
    );
    if (!msg) {
      return undefined;
    }
    return {
      l1BlockNumber: msg.l1BlockNumber,
      l1BlockHash: Buffer32.fromBigInt(msg.l1BlockNumber),
      l1TransactionHash: `0x${msg.l1BlockNumber.toString(16)}` as `0x${string}`,
      l1BlockTimestamp: this.getTimestampAtL1Block(msg.l1BlockNumber),
      args: {
        index: msg.index,
        leaf: msg.leaf,
        inboxRollingHash: msg.inboxRollingHash,
        bucketSeq: msg.bucketSeq,
      },
    };
  }

  private async makeRollupTx(
    checkpoint: Checkpoint,
    signers: Secp256k1Signer[],
  ): Promise<{ tx: Transaction; attestationsHash: Buffer32; payloadDigest: Buffer32 }> {
    const signatureContext = this.getSignatureContext();
    const consensusPayload = ConsensusPayload.fromCheckpoint(checkpoint, signatureContext);
    const attestationDigest = getHashedSignaturePayloadTypedData(consensusPayload);
    const attestations = signers
      .map(signer => CommitteeAttestation.fromSignature(signer.sign(attestationDigest)))
      .map(committeeAttestation => committeeAttestation.toViem());

    const header = checkpoint.header.toViem();
    const blobInput = getPrefixedEthBlobCommitments(await getBlobsPerL1Block(checkpoint.toBlobFields()));
    const archive = toHex(checkpoint.archive.root.toBuffer());
    const attestationsAndSigners = new CommitteeAttestationsAndSigners(
      attestations.map(attestation => CommitteeAttestation.fromViem(attestation)),
      signatureContext,
    );

    // Fall back to a random signer when no attesters are provided, so tests that
    // don't care about the proposer identity (e.g. sync tests) still produce a
    // valid-looking signature for the attestationsAndSigners struct.
    const proposerSigner = signers[0] ?? Secp256k1Signer.random();
    const attestationsAndSignersSignature = proposerSigner.sign(
      getHashedSignaturePayloadTypedData(attestationsAndSigners),
    );

    const verbatimAttestations = attestationsAndSigners.getPackedAttestations();

    const rollupInput = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args: [
        {
          header,
          archive,
          oracleInput: { feeAssetPriceModifier: 0n },
          bucketHint: 0n,
        },
        verbatimAttestations,
        attestationsAndSigners.getSigners().map(signer => signer.toString()),
        attestationsAndSignersSignature.toViemSignature(),
        blobInput,
      ],
    });

    const multiCallInput = encodeFunctionData({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [
        [
          {
            target: this.config.rollupAddress.toString(),
            callData: rollupInput,
            allowFailure: false,
          },
        ],
      ],
    });

    // Compute attestationsHash (same logic as CalldataRetriever)
    const attestationsHash = Buffer32.fromString(
      keccak256(encodeAbiParameters([this.getCommitteeAttestationsStructDef()], [verbatimAttestations])),
    );

    // Compute payloadDigest (same logic as CalldataRetriever)
    const payloadDigest = getHashedSignaturePayloadTypedData(consensusPayload);

    const tx = {
      input: multiCallInput,
      hash: archive,
      blockHash: archive,
      to: MULTI_CALL_3_ADDRESS as `0x${string}`,
    } as Transaction<bigint, number>;

    return { tx, attestationsHash, payloadDigest };
  }

  private getSignatureContext() {
    return {
      chainId: 1,
      rollupAddress: this.config.rollupAddress,
    };
  }

  /** Extracts the CommitteeAttestations struct definition from RollupAbi for hash computation. */
  private getCommitteeAttestationsStructDef(): AbiParameter {
    const proposeFunction = RollupAbi.find(item => item.type === 'function' && item.name === 'propose') as
      | { type: 'function'; name: string; inputs: readonly AbiParameter[] }
      | undefined;

    if (!proposeFunction) {
      throw new Error('propose function not found in RollupAbi');
    }

    const attestationsParam = proposeFunction.inputs.find(param => param.name === '_attestations');
    if (!attestationsParam) {
      throw new Error('_attestations parameter not found in propose function');
    }

    const tupleParam = attestationsParam as unknown as { type: 'tuple'; components?: readonly AbiParameter[] };
    return { type: 'tuple', components: tupleParam.components || [] } as AbiParameter;
  }

  private async makeVersionedBlobHashes(checkpoint: Checkpoint): Promise<`0x${string}`[]> {
    return (await getBlobsPerL1Block(checkpoint.toBlobFields())).map(
      b => `0x${b.getEthVersionedBlobHash().toString('hex')}` as `0x${string}`,
    );
  }

  private async makeBlobsFromCheckpoint(checkpoint: Checkpoint): Promise<Blob[]> {
    return await getBlobsPerL1Block(checkpoint.toBlobFields());
  }
}

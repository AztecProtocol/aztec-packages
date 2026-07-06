import {
  MAX_NOTE_HASHES_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PRIVATE_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { times, timesParallel } from '@aztec/foundation/collection';
import { randomBigInt, randomInt } from '@aztec/foundation/crypto/random';
import type { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { orderAttestations } from '@aztec/stdlib/consensus';
import { PrivateLog, PublicLog, SiloedTag, Tag } from '@aztec/stdlib/logs';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { makeCheckpointAttestationFromCheckpoint } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { PartialStateReference, StateReference, TxEffect } from '@aztec/stdlib/tx';

import { type InboxMessage, updateRollingHash } from '../structs/inbox_message.js';

export function makeInboxMessage(
  previousRollingHash = Buffer16.ZERO,
  overrides: Partial<InboxMessage> = {},
): InboxMessage {
  const { checkpointNumber = CheckpointNumber(randomInt(100) + 1) } = overrides;
  const { l1BlockNumber = randomBigInt(100n) + 1n } = overrides;
  const { l1BlockHash = Buffer32.random() } = overrides;
  const { leaf = Fr.random() } = overrides;
  const { rollingHash = updateRollingHash(previousRollingHash, leaf) } = overrides;
  const { index = InboxLeaf.smallestIndexForCheckpoint(checkpointNumber) } = overrides;

  return {
    index,
    leaf,
    checkpointNumber,
    l1BlockNumber,
    l1BlockHash,
    rollingHash,
  };
}

export function makeInboxMessages(
  totalCount: number,
  opts: {
    initialHash?: Buffer16;
    initialCheckpointNumber?: CheckpointNumber;
    messagesPerCheckpoint?: number;
    overrideFn?: (msg: InboxMessage, index: number) => InboxMessage;
  } = {},
): InboxMessage[] {
  const {
    initialHash = Buffer16.ZERO,
    overrideFn = msg => msg,
    initialCheckpointNumber = CheckpointNumber(1),
    messagesPerCheckpoint = 1,
  } = opts;

  const messages: InboxMessage[] = [];
  let rollingHash = initialHash;
  for (let i = 0; i < totalCount; i++) {
    const msgIndex = i % messagesPerCheckpoint;
    const checkpointNumber = CheckpointNumber.fromBigInt(
      BigInt(initialCheckpointNumber) + BigInt(i) / BigInt(messagesPerCheckpoint),
    );
    const leaf = Fr.random();
    const message = overrideFn(
      makeInboxMessage(rollingHash, {
        leaf,
        checkpointNumber,
        index: InboxLeaf.smallestIndexForCheckpoint(checkpointNumber) + BigInt(msgIndex),
      }),
      i,
    );
    rollingHash = message.rollingHash;
    messages.push(message);
  }
  return messages;
}

/** Creates inbox messages distributed across multiple blocks with proper checkpoint numbering. */
export function makeInboxMessagesWithFullBlocks(
  blockCount: number,
  opts: { initialCheckpointNumber?: CheckpointNumber } = {},
): InboxMessage[] {
  const { initialCheckpointNumber = CheckpointNumber(13) } = opts;
  return makeInboxMessages(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * blockCount, {
    overrideFn: (msg, i) => {
      const checkpointNumber = CheckpointNumber(
        initialCheckpointNumber + Math.floor(i / NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
      );
      const index =
        InboxLeaf.smallestIndexForCheckpoint(checkpointNumber) + BigInt(i % NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
      return { ...msg, checkpointNumber, index };
    },
  });
}

/** Creates a deterministic block hash from a block number. */
export function makeBlockHash(blockNumber: number): `0x${string}` {
  return `0x${blockNumber.toString(16).padStart(64, '0')}`;
}

/**
 * Creates a StateReference with properly calculated noteHashTree.nextAvailableLeafIndex.
 * This ensures LogStore's dataStartIndexForBlock calculation doesn't produce negative values.
 */
export function makeStateForBlock(blockNumber: number, txsPerBlock: number): StateReference {
  const noteHashIndex = blockNumber * txsPerBlock * MAX_NOTE_HASHES_PER_TX;
  return new StateReference(
    AppendOnlyTreeSnapshot.random(),
    new PartialStateReference(
      new AppendOnlyTreeSnapshot(Fr.random(), noteHashIndex),
      AppendOnlyTreeSnapshot.random(),
      AppendOnlyTreeSnapshot.random(),
    ),
  );
}

/** Creates L1PublishedData with deterministic values based on l1BlockNumber. */
export function makeL1PublishedData(l1BlockNumber: number): L1PublishedData {
  return new L1PublishedData(BigInt(l1BlockNumber), BigInt(l1BlockNumber * 1000), makeBlockHash(l1BlockNumber));
}

/** Creates a Checkpoint from a list of blocks with a header that matches the blocks' structure. */
export function makeCheckpoint(blocks: L2Block[], checkpointNumber = CheckpointNumber(1)): Checkpoint {
  const firstBlock = blocks[0];
  const { slotNumber, timestamp, coinbase, feeRecipient, gasFees } = firstBlock.header.globalVariables;
  return new Checkpoint(
    blocks.at(-1)!.archive,
    CheckpointHeader.random({
      lastArchiveRoot: firstBlock.header.lastArchive.root,
      slotNumber,
      timestamp,
      coinbase,
      feeRecipient,
      gasFees,
    }),
    blocks,
    checkpointNumber,
  );
}

/** Wraps a Checkpoint with L1 published data and random attestations. */
export function makePublishedCheckpoint(
  checkpoint: Checkpoint,
  l1BlockNumber: number,
  attestationCount = 3,
): PublishedCheckpoint {
  return new PublishedCheckpoint(
    checkpoint,
    makeL1PublishedData(l1BlockNumber),
    times(attestationCount, CommitteeAttestation.random),
  );
}

export interface MakeChainedCheckpointsOptions {
  /** Number of L2 blocks per checkpoint. Default: 1 */
  blocksPerCheckpoint?: number;
  /** Number of transactions per block. Default: 4 */
  txsPerBlock?: number;
  /** Starting checkpoint number. Default: CheckpointNumber(1) */
  startCheckpointNumber?: CheckpointNumber;
  /** Starting block number. Default: 1 */
  startBlockNumber?: number;
  /** Starting L1 block number. Default: 10 */
  startL1BlockNumber?: number;
  /** Previous archive to chain from. Default: undefined */
  previousArchive?: AppendOnlyTreeSnapshot;
  /** Optional function to provide per-checkpoint overrides */
  makeCheckpointOptions?: (cpNumber: CheckpointNumber) => Partial<Parameters<typeof Checkpoint.random>[1]>;
}

/**
 * Creates multiple checkpoints with properly chained archives.
 * Each checkpoint's blocks have their lastArchive set to the previous block's archive,
 * ensuring archive chain continuity for testing.
 */
export async function makeChainedCheckpoints(
  count: number,
  options: MakeChainedCheckpointsOptions = {},
): Promise<PublishedCheckpoint[]> {
  const {
    blocksPerCheckpoint = 1,
    txsPerBlock = 4,
    startCheckpointNumber = CheckpointNumber(1),
    startBlockNumber = 1,
    startL1BlockNumber = 10,
    makeCheckpointOptions,
  } = options;

  let previousArchive = options.previousArchive;
  const checkpoints: PublishedCheckpoint[] = [];

  for (let i = 0; i < count; i++) {
    const cpNumber = CheckpointNumber(startCheckpointNumber + i);
    const blockStart = startBlockNumber + i * blocksPerCheckpoint;
    const customOptions = makeCheckpointOptions?.(cpNumber) ?? {};

    const checkpoint = await Checkpoint.random(cpNumber, {
      numBlocks: blocksPerCheckpoint,
      startBlockNumber: blockStart,
      previousArchive,
      txsPerBlock,
      state: makeStateForBlock(blockStart, txsPerBlock),
      txOptions: { numPublicCallsPerTx: 2, numPublicLogsPerCall: 2 },
      ...customOptions,
    });

    previousArchive = checkpoint.blocks.at(-1)!.archive;
    checkpoints.push(makePublishedCheckpoint(checkpoint, startL1BlockNumber + i * 10));
  }

  return checkpoints;
}

/**
 * Creates a PublishedCheckpoint with attestations signed by the provided signers.
 * Useful for testing attestation validation.
 */
export function makeSignedPublishedCheckpoint(
  checkpoint: Checkpoint,
  signers: Secp256k1Signer[],
  committee: EthAddress[],
  l1BlockNumber = 1,
): PublishedCheckpoint {
  const attestations = signers.map(signer => makeCheckpointAttestationFromCheckpoint(checkpoint, signer));
  const committeeAttestations = orderAttestations(attestations, committee);
  return new PublishedCheckpoint(checkpoint, makeL1PublishedData(l1BlockNumber), committeeAttestations);
}

/** Creates a deterministic SiloedTag for private log testing. */
export function makePrivateLogTag(blockNumber: number, txIndex: number, logIndex: number): SiloedTag {
  return new SiloedTag(
    blockNumber === 1 && txIndex === 0 && logIndex === 0
      ? Fr.ZERO
      : new Fr(blockNumber * 100 + txIndex * 10 + logIndex),
  );
}

/** Creates a PrivateLog with fields derived from the tag. */
export function makePrivateLog(tag: SiloedTag): PrivateLog {
  return PrivateLog.from({
    fields: makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, i => (!i ? tag.value : new Fr(tag.value.toBigInt() + BigInt(i)))),
    emittedLength: PRIVATE_LOG_SIZE_IN_FIELDS,
  });
}

/** Creates multiple private logs for a transaction. */
export function mockPrivateLogs(blockNumber: number, txIndex: number, numLogsPerTx: number): PrivateLog[] {
  return times(numLogsPerTx, logIndex => {
    const tag = makePrivateLogTag(blockNumber, txIndex, logIndex);
    return makePrivateLog(tag);
  });
}

/** Creates a deterministic Tag for public log testing. */
export function makePublicLogTag(blockNumber: number, txIndex: number, logIndex: number): Tag {
  return new Tag(
    blockNumber === 1 && txIndex === 0 && logIndex === 0
      ? Fr.ZERO
      : new Fr((blockNumber * 100 + txIndex * 10 + logIndex) * 123),
  );
}

/** Creates a PublicLog with fields derived from the tag. */
export function makePublicLog(tag: Tag, contractAddress: AztecAddress = AztecAddress.fromNumber(543254)): PublicLog {
  return PublicLog.from({
    contractAddress,
    fields: new Array(10).fill(null).map((_, i) => (!i ? tag.value : new Fr(tag.value.toBigInt() + BigInt(i)))),
  });
}

/** Creates multiple public logs for a transaction. */
export function makePublicLogs(
  blockNumber: number,
  txIndex: number,
  numLogsPerTx: number,
  contractAddress: AztecAddress = AztecAddress.fromNumber(543254),
): PublicLog[] {
  return times(numLogsPerTx, logIndex => {
    const tag = makePublicLogTag(blockNumber, txIndex, logIndex);
    return makePublicLog(tag, contractAddress);
  });
}

export interface MockCheckpointWithLogsOptions {
  previousArchive?: AppendOnlyTreeSnapshot;
  numTxsPerBlock?: number;
  privateLogs?: { numLogsPerTx: number };
  publicLogs?: { numLogsPerTx: number; contractAddress?: AztecAddress };
}

/** Creates a checkpoint with specified logs on each tx effect. */
export async function makeCheckpointWithLogs(
  blockNumber: number,
  options: MockCheckpointWithLogsOptions = {},
): Promise<PublishedCheckpoint> {
  const { previousArchive, numTxsPerBlock = 4, privateLogs, publicLogs } = options;

  const block = await L2Block.random(BlockNumber(blockNumber), {
    checkpointNumber: CheckpointNumber.fromBlockNumber(BlockNumber(blockNumber)),
    indexWithinCheckpoint: IndexWithinCheckpoint(0),
    state: makeStateForBlock(blockNumber, numTxsPerBlock),
    ...(previousArchive ? { lastArchive: previousArchive } : {}),
  });
  block.header.globalVariables.blockNumber = BlockNumber(blockNumber);

  block.body.txEffects = await timesParallel(numTxsPerBlock, async (txIndex: number) => {
    const txEffect = await TxEffect.random();
    txEffect.privateLogs = privateLogs ? mockPrivateLogs(blockNumber, txIndex, privateLogs.numLogsPerTx) : [];
    txEffect.publicLogs = publicLogs
      ? makePublicLogs(blockNumber, txIndex, publicLogs.numLogsPerTx, publicLogs.contractAddress)
      : [];
    return txEffect;
  });

  const checkpoint = makeCheckpoint([block], CheckpointNumber.fromBlockNumber(BlockNumber(blockNumber)));
  return makePublishedCheckpoint(checkpoint, blockNumber);
}

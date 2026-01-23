import {
  FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PRIVATE_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import type { BlockBlobData, BlockEndBlobData } from './block_blob_data.js';
import type { BlockEndMarker } from './block_end_marker.js';
import type { BlockEndStateField } from './block_end_state_field.js';
import { type CheckpointBlobData, getTotalNumBlobFieldsFromTxs } from './checkpoint_blob_data.js';
import { type TxBlobData, getNumTxBlobFields } from './tx_blob_data.js';
import type { TxStartMarker } from './tx_start_marker.js';

const fr = (seed: number) => new Fr(BigInt(seed));

export function makeTxStartMarker({
  isFullTx = false,
  ...overrides
}: { isFullTx?: boolean } & Partial<TxStartMarker> = {}): TxStartMarker {
  const partialTxStartMarker = {
    revertCode: 0,
    numNoteHashes: isFullTx ? MAX_NOTE_HASHES_PER_TX : 1,
    numNullifiers: isFullTx ? MAX_NULLIFIERS_PER_TX : 1,
    numL2ToL1Msgs: isFullTx ? MAX_L2_TO_L1_MSGS_PER_TX : 1,
    numPublicDataWrites: isFullTx ? MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX : 1,
    numPrivateLogs: isFullTx ? MAX_PRIVATE_LOGS_PER_TX : 1,
    privateLogsLength: isFullTx ? PRIVATE_LOG_SIZE_IN_FIELDS * MAX_PRIVATE_LOGS_PER_TX : 1,
    publicLogsLength: isFullTx ? FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH : 1,
    contractClassLogLength: isFullTx ? MAX_CONTRACT_CLASS_LOGS_PER_TX : 1,
    ...overrides,
  };

  const numBlobFields = overrides.numBlobFields ?? getNumTxBlobFields(partialTxStartMarker);
  return {
    ...partialTxStartMarker,
    numBlobFields,
  };
}

export function makeTxBlobData({
  isFullTx = false,
  seed = 1,
  ...overrides
}: { isFullTx?: boolean; seed?: number } & Partial<
  Omit<TxBlobData, 'txStartMarker'> & { txStartMarker?: Partial<TxStartMarker> }
> = {}): TxBlobData {
  const { txStartMarker: txStartMarkerOverrides, ...txBlobDataOverrides } = overrides;
  const txStartMarker = makeTxStartMarker({ isFullTx, ...txStartMarkerOverrides });

  const noteHashes = makeTuple(txStartMarker.numNoteHashes, fr, seed);
  const nullifiers = makeTuple(txStartMarker.numNullifiers, fr, seed + 0x100);
  const l2ToL1Msgs = makeTuple(txStartMarker.numL2ToL1Msgs, fr, seed + 0x200);
  const publicDataWrites = makeTuple(
    txStartMarker.numPublicDataWrites,
    i => [fr(seed + i * 2), fr(seed + i * 2 + 1)] satisfies [Fr, Fr],
    seed + 0x300,
  );

  const privateLogs = [];
  if (txStartMarker.privateLogsLength > txStartMarker.numPrivateLogs * PRIVATE_LOG_SIZE_IN_FIELDS) {
    throw new Error('Private logs length is too large');
  }
  if (txStartMarker.privateLogsLength < txStartMarker.numPrivateLogs) {
    throw new Error('Private logs length is too small');
  }
  let remainingNumPrivateLogs = txStartMarker.numPrivateLogs;
  let remainingPrivateLogsLength = txStartMarker.privateLogsLength;
  for (let i = 0; i < txStartMarker.numPrivateLogs; i++) {
    const minLength = Math.max(
      1,
      remainingPrivateLogsLength - (remainingNumPrivateLogs - 1) * PRIVATE_LOG_SIZE_IN_FIELDS,
    );
    const length = Math.max(minLength, Math.floor(remainingPrivateLogsLength / remainingNumPrivateLogs));
    privateLogs.push(makeTuple(length, fr, seed + 0x400 + i * PRIVATE_LOG_SIZE_IN_FIELDS));
    remainingNumPrivateLogs -= 1;
    remainingPrivateLogsLength -= length;
  }

  const publicLogs = makeTuple(txStartMarker.publicLogsLength, fr, seed + 0x500);
  const contractClassLogBlobDataLength =
    txStartMarker.contractClassLogLength > 0 ? txStartMarker.contractClassLogLength + 1 : 0; // If the log exists, +1 for the contract address
  const contractClassLog = makeTuple(contractClassLogBlobDataLength, fr, seed + 0x600);

  return {
    txStartMarker,
    txHash: fr(seed + 0x700),
    transactionFee: fr(seed + 0x800),
    noteHashes,
    nullifiers,
    l2ToL1Msgs,
    publicDataWrites,
    privateLogs,
    publicLogs,
    contractClassLog,
    ...txBlobDataOverrides,
  };
}

export function makeBlockEndMarker({
  seed = 1,
  ...overrides
}: { seed?: number } & Partial<BlockEndMarker> = {}): BlockEndMarker {
  return {
    numTxs: seed,
    blockNumber: BlockNumber(seed + 1),
    timestamp: BigInt(seed + 2),
    ...overrides,
  };
}

export function makeBlockEndStateField({
  seed = 1,
  ...overrides
}: { seed?: number } & Partial<BlockEndStateField> = {}): BlockEndStateField {
  return {
    l1ToL2MessageNextAvailableLeafIndex: seed,
    noteHashNextAvailableLeafIndex: seed + 0x10,
    nullifierNextAvailableLeafIndex: seed + 0x20,
    publicDataNextAvailableLeafIndex: seed + 0x30,
    totalManaUsed: BigInt(seed + 0x40),
    ...overrides,
  };
}

export function makeBlockEndBlobData({
  isFirstBlock = true,
  seed = 1,
  ...overrides
}: { seed?: number; isFirstBlock?: boolean } & Partial<
  Omit<BlockEndBlobData, 'blockEndMarker' | 'blockEndStateField'>
> & {
    blockEndMarker?: Partial<BlockEndMarker>;
    blockEndStateField?: Partial<BlockEndStateField>;
  } = {}): BlockEndBlobData {
  const {
    blockEndMarker: blockEndMarkerOverrides,
    blockEndStateField: blockEndStateFieldOverrides,
    ...blockEndBlobDataOverrides
  } = overrides;
  return {
    blockEndMarker: makeBlockEndMarker({ seed, ...blockEndMarkerOverrides }),
    blockEndStateField: makeBlockEndStateField({ seed: seed + 0x100, ...blockEndStateFieldOverrides }),
    lastArchiveRoot: fr(seed + 0x200),
    noteHashRoot: fr(seed + 0x300),
    nullifierRoot: fr(seed + 0x400),
    publicDataRoot: fr(seed + 0x500),
    l1ToL2MessageRoot: isFirstBlock ? fr(seed + 0x600) : undefined,
    ...blockEndBlobDataOverrides,
  };
}

export function makeBlockBlobData({
  numTxs = 1,
  isFirstBlock = true,
  isFullTx = false,
  seed = 1,
  ...overrides
}: { numTxs?: number; isFirstBlock?: boolean; isFullTx?: boolean; seed?: number } & Partial<
  Parameters<typeof makeBlockEndBlobData>[0]
> = {}): BlockBlobData {
  return {
    txs: makeTuple(numTxs, i => makeTxBlobData({ isFullTx, seed: seed + i * 0x100 }), seed),
    ...makeBlockEndBlobData({
      seed: seed + 0x1000 * numTxs,
      blockEndMarker: {
        numTxs,
      },
      isFirstBlock,
      ...overrides,
    }),
  };
}

export function makeCheckpointBlobData({
  numBlocks = 1,
  numTxsPerBlock = 1,
  isFullTx = false,
  seed = 1,
  ...overrides
}: {
  numBlocks?: number;
  numTxsPerBlock?: number;
  isFullTx?: boolean;
  seed?: number;
} & Partial<CheckpointBlobData> = {}): CheckpointBlobData {
  const blocks =
    overrides.blocks ??
    makeTuple(
      numBlocks,
      i => makeBlockBlobData({ numTxs: numTxsPerBlock, isFirstBlock: i === seed, isFullTx, seed: seed + i * 0x1000 }),
      seed,
    );

  const numBlobFields =
    overrides.checkpointEndMarker?.numBlobFields ??
    getTotalNumBlobFieldsFromTxs(blocks.map(block => block.txs.map(tx => tx.txStartMarker)));

  return {
    blocks,
    checkpointEndMarker: { numBlobFields },
  };
}

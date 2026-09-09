import type { FeeHeader } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import {
  BlockHash,
  type L1SyncPoint,
  type L2Frontier,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { L1PublishedData, type ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import { GasFees } from '@aztec/stdlib/gas';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

/** Shape of the frontier snapshot a next-block test wants; every field has a sensible default. */
export type L2FrontierArgs = {
  proposed: BlockNumber;
  checkpointedBlock: BlockNumber;
  checkpointed: CheckpointNumber;
  /** Slot of the checkpointed checkpoint, the floor for the next block's slot. Omit for the genesis shape. */
  checkpointedTipSlot?: SlotNumber;
  proposedCheckpoint?: ProposedCheckpointData;
  /** Globals of the proposed tip's header, copied verbatim when the next block continues a checkpoint. */
  latestBlockGlobals?: { slotNumber: SlotNumber; gasFees?: GasFees };
  /** Omit the proposed tip's header from the snapshot, an invariant violation the predictor must reject. */
  omitLatestBlockHeader?: boolean;
  pendingChainValidationStatus?: ValidateCheckpointResult;
  /** L1 block the archiver's snapshot reflects; fee reads must be pinned to it. */
  l1SyncPoint?: L1SyncPoint;
};

/** Stable per-block hash, so tips and the frontier agree on block identity. */
export const blockHashOf = (blockNumber: BlockNumber): BlockHash => new BlockHash(new Fr(1000 + blockNumber));

const makeTips = (args: L2FrontierArgs): L2Tips => {
  const blockId = (number: BlockNumber) => ({ number, hash: blockHashOf(number).toString() });
  const checkpointId = (number: CheckpointNumber) => ({ number, hash: `0xc${number}` });
  return {
    proposed: blockId(args.proposed),
    checkpointed: { block: blockId(args.checkpointedBlock), checkpoint: checkpointId(args.checkpointed) },
    proven: { block: blockId(BlockNumber.ZERO), checkpoint: checkpointId(args.checkpointed) },
    finalized: { block: blockId(BlockNumber.ZERO), checkpoint: checkpointId(args.checkpointed) },
  };
};

export const makeFrontier = (args: L2FrontierArgs): L2Frontier => ({
  tips: makeTips(args),
  proposedCheckpoint: args.proposedCheckpoint,
  l1SyncPoint: args.l1SyncPoint,
  latestBlockHeader:
    args.omitLatestBlockHeader || !args.latestBlockGlobals
      ? undefined
      : BlockHeader.empty({
          globalVariables: GlobalVariables.empty({
            blockNumber: args.proposed,
            slotNumber: args.latestBlockGlobals.slotNumber,
            gasFees: args.latestBlockGlobals.gasFees ?? GasFees.empty(),
          }),
        }),
  checkpointedCheckpoint:
    args.checkpointedTipSlot === undefined
      ? undefined
      : {
          header: CheckpointHeader.empty({ slotNumber: args.checkpointedTipSlot }),
          l1: new L1PublishedData(1n, 0n, `0x`),
        },
  pendingChainValidationStatus: args.pendingChainValidationStatus ?? { valid: true },
});

export function makeFeeHeader(): FeeHeader {
  return { excessMana: 0n, manaUsed: 0n, ethPerFeeAsset: 0n, congestionCost: 0n, proverCost: 0n };
}

export function makeProposedCheckpointData(args: {
  checkpointNumber: CheckpointNumber;
  lastBlock: BlockNumber;
  slotNumber?: SlotNumber;
  archiveRoot?: Fr;
  totalManaUsed?: bigint;
  feeAssetPriceModifier?: bigint;
  checkpointOutHash?: Fr;
}): ProposedCheckpointData {
  return {
    checkpointNumber: args.checkpointNumber,
    header: CheckpointHeader.empty({ slotNumber: args.slotNumber ?? SlotNumber(0) }),
    startBlock: args.lastBlock,
    blockCount: 1,
    totalManaUsed: args.totalManaUsed ?? 555n,
    feeAssetPriceModifier: args.feeAssetPriceModifier ?? 7n,
    archive: new AppendOnlyTreeSnapshot(args.archiveRoot ?? Fr.ZERO, 0),
    checkpointOutHash: args.checkpointOutHash ?? Fr.fromString('0xfeed'),
  };
}

export function makeInvalidStatus(firstInvalid: CheckpointNumber): ValidateCheckpointResult {
  return {
    valid: false,
    checkpoint: {
      archive: Fr.random(),
      lastArchive: Fr.random(),
      slotNumber: SlotNumber(10),
      checkpointNumber: firstInvalid,
      timestamp: 0n,
    },
    committee: [],
    epoch: EpochNumber.ZERO,
    seed: 0n,
    attestors: [],
    attestations: [],
    verbatimAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
    reason: 'insufficient-attestations',
  };
}

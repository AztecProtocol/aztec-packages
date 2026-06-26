import type { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import {
  BlockHash,
  type BlockParameter,
  BlockTag,
  type L2BlockSource,
  type NormalizedBlockParameter,
} from '@aztec/stdlib/block';
import type { CheckpointParameter, CheckpointTag } from '@aztec/stdlib/interfaces/client';

/** True when `value` is a {@link BlockTag}. */
export function isBlockTag(value: string): value is BlockTag {
  return BlockTag.includes(value as BlockTag);
}

/** True when `value` is a {@link CheckpointTag}. */
export function isCheckpointTag(value: unknown): value is CheckpointTag {
  return value === 'checkpointed' || value === 'proven' || value === 'finalized';
}

/**
 * Normalizes a {@link BlockParameter} (which may be a bare value) into a {@link NormalizedBlockParameter}
 * object form. Performs no chain-tip resolution — tag lookups are deferred to the underlying block source.
 */
export function normalizeBlockParameter(param: BlockParameter): NormalizedBlockParameter {
  if (BlockHash.isBlockHash(param)) {
    return { hash: param };
  }
  if (typeof param === 'number') {
    return { number: param as BlockNumber };
  }
  if (typeof param === 'string') {
    if (isBlockTag(param)) {
      return { tag: param === 'latest' ? 'proposed' : param };
    }
    throw new BadRequestError(`Invalid BlockParameter tag: ${param}`);
  }
  if (typeof param === 'object' && param !== null) {
    if ('number' in param) {
      return { number: param.number };
    }
    if ('hash' in param) {
      return { hash: param.hash };
    }
    if ('archive' in param) {
      return { archive: param.archive };
    }
    if ('tag' in param) {
      if (isBlockTag(param.tag)) {
        return { tag: param.tag };
      }
      throw new BadRequestError(`Invalid BlockParameter tag: ${param.tag}`);
    }
  }
  throw new BadRequestError(`Invalid BlockParameter: ${JSON.stringify(param)}`);
}

/**
 * Resolves a {@link CheckpointParameter} into a concrete `{ number }` or `{ slot }` query.
 *
 * Tag-based parameters (`'checkpointed'`, `'proven'`, `'finalized'`) are translated up-front to the
 * corresponding tip's checkpoint number via {@link L2BlockSource.getL2Tips}. After resolution the unified
 * `getCheckpoint` flow can perform a single confirmed→proposed lookup against either store.
 */
export async function resolveCheckpointParameter(
  param: CheckpointParameter,
  blockSource: L2BlockSource,
): Promise<{ number: CheckpointNumber } | { slot: SlotNumber }> {
  if (typeof param === 'number') {
    return { number: param as CheckpointNumber };
  }
  if (isCheckpointTag(param)) {
    const tips = await blockSource.getL2Tips();
    switch (param) {
      case 'checkpointed':
        return { number: tips.checkpointed.checkpoint.number };
      case 'proven':
        return { number: tips.proven.checkpoint.number };
      case 'finalized':
        return { number: tips.finalized.checkpoint.number };
    }
  }
  if (typeof param === 'object' && param !== null) {
    if ('number' in param) {
      return { number: param.number };
    }
    if ('slot' in param) {
      return { slot: param.slot };
    }
  }
  throw new BadRequestError(`Invalid CheckpointParameter: ${JSON.stringify(param)}`);
}

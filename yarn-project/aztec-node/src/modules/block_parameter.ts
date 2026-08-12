import type { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import {
  type AnchoredBlockParameter,
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
 * Normalizes a {@link BlockParameter} (which may be a bare value) into a {@link NormalizedBlockParameter} object
 * form, or into an {@link AnchoredBlockParameter} when it names a block by both number and hash. Performs no
 * chain-tip resolution — tag lookups are deferred to the underlying block source.
 *
 * The anchored form is only understood by the unseen-block hold-off, which reduces it to a single-selector query
 * before anything reads the block source. Nothing else may forward it: the archiver reads `number` in preference to
 * `hash`, so an anchored query reaching it would resolve by height and lose the fork the hash pins.
 */
export function normalizeBlockParameter(param: BlockParameter): NormalizedBlockParameter | AnchoredBlockParameter {
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
    // Read the selectors by value rather than by key presence: an in-process caller can hand over an object built
    // from optional fields, where a selector it did not mean to set is present but undefined.
    const number = 'number' in param ? param.number : undefined;
    const hash = 'hash' in param ? param.hash : undefined;
    if (number !== undefined && hash !== undefined) {
      return { number, hash };
    }
    if (number !== undefined) {
      return { number };
    }
    if (hash !== undefined) {
      return { hash };
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

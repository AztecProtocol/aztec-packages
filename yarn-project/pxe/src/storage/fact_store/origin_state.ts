import type { Fr } from '@aztec/foundation/curves/bn254';
import type { L2Tips } from '@aztec/stdlib/block';

import type { FactCollectionKey, OriginBlock } from './fact_store_keys.js';
import type { Fact } from './stored_fact.js';

/**
 * Chain state of a retractable fact's origin block, mirroring the L2 chain tips.
 *
 * - `Pending`: above the proven tip.
 * - `Proven`: proof on L1 but not yet finalized.
 * - `Finalized`: L1-finalized.
 *
 * The numeric discriminants must stay in sync with the Noir `OriginBlockState` in
 * `noir-projects/labs/aztec-nr/aztec/src/facts/origin_state.nr`: PXE serializes this value into the `Fact` oracle response
 * and Noir deserializes it via `from_u8`, which rejects any value outside this set.
 */
export enum OriginBlockState {
  Pending = 1,
  Proven = 2,
  Finalized = 3,
}

/** Parses a numeric origin-block-state discriminant, rejecting unknown values. */
export function originBlockStateFromNumber(value: number): OriginBlockState {
  if (!(value in OriginBlockState)) {
    const validNames = Object.keys(OriginBlockState).filter(k => isNaN(Number(k)));
    throw new Error(`Invalid OriginBlockState value ${value}, expected one of ${validNames.join(', ')}`);
  }
  return value as OriginBlockState;
}

/** The two chain-tip block numbers needed to classify an origin block (`finalized <= proven` always holds). */
export type TipBlockNumbers = { provenBlockNumber: number; finalizedBlockNumber: number };

/**
 * Projects the live chain tips to the block numbers used for classification, capped at the anchor block.
 *
 * A utility execution reads against a fixed anchor block, and every other node query in the oracle is bounded by it.
 * Capping the proven/finalized tips at the anchor keeps origin-state consistent with that view and deterministic
 * across runs: an origin block at or before the anchor classifies exactly as it would against the live tips, while an
 * origin block above the anchor is reported `Pending` rather than trusting tips that look past the anchor.
 */
export function anchoredTipBlockNumbers(tips: L2Tips, anchorBlockNumber: number): TipBlockNumbers {
  return {
    provenBlockNumber: Math.min(tips.proven.block.number, anchorBlockNumber),
    finalizedBlockNumber: Math.min(tips.finalized.block.number, anchorBlockNumber),
  };
}

/** A retractable fact's origin block annotated with that block's current chain state. */
export type RetractableFactOrigin = OriginBlock & { blockState: OriginBlockState };

/** A fact enriched with origin-block state. `originBlock` is undefined for a non-retractable fact. */
export type FactWithOriginState = { factTypeId: Fr; payload: Fr[]; originBlock: RetractableFactOrigin | undefined };

/** A fact collection whose facts carry origin-block state. */
export type FactCollectionWithOriginState = { key: FactCollectionKey; facts: FactWithOriginState[] };

/**
 * Classifies an origin block by number against the chain tips. A surviving retractable fact's origin block is
 * guaranteed canonical (a reorg would have pruned the fact), so a number comparison is sufficient.
 */
export function classifyOriginBlockState(blockNumber: number, tips: TipBlockNumbers): OriginBlockState {
  if (blockNumber <= tips.finalizedBlockNumber) {
    return OriginBlockState.Finalized;
  }
  if (blockNumber <= tips.provenBlockNumber) {
    return OriginBlockState.Proven;
  }
  return OriginBlockState.Pending;
}

/** Enriches a stored fact with the chain state of its origin block (when retractable). */
export function toFactWithOriginState(fact: Fact, tips: TipBlockNumbers): FactWithOriginState {
  const originBlock: RetractableFactOrigin | undefined = fact.originBlock
    ? {
        blockNumber: fact.originBlock.blockNumber,
        blockHash: fact.originBlock.blockHash,
        blockState: classifyOriginBlockState(fact.originBlock.blockNumber, tips),
      }
    : undefined;
  return { factTypeId: fact.factTypeId, payload: fact.payload, originBlock };
}

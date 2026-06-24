import type { Fr } from '@aztec/foundation/curves/bn254';

import type { FactCollectionKey, OriginBlock } from './fact_store_keys.js';
import type { Fact } from './stored_fact.js';

/**
 * Chain state of a retractable fact's origin block, mirroring the L2 chain tips. The numeric values are the wire
 * discriminants shared with the Noir `OriginState` wrapper.
 *
 * - `Pending`: above the proven tip; still reorg-able.
 * - `Proven`: proof on L1 but not yet finalized — confidence, not safety.
 * - `Finalized`: L1-finalized and therefore irreversible (the only retraction-proof state).
 */
export enum OriginState {
  Pending = 1,
  Proven = 2,
  Finalized = 3,
}

/** The two chain-tip block numbers needed to classify an origin block (`finalized <= proven` always holds). */
export type TipBlockNumbers = { provenBlockNumber: number; finalizedBlockNumber: number };

/** A retractable fact's origin block, annotated with that block's current chain state. */
export type RetractableFactOrigin = { blockNumber: number; blockHash: Fr; blockState: OriginState };

/** A fact enriched with origin-block state. `originBlock` is undefined for a non-retractable fact. */
export type AnnotatedFact = { factTypeId: Fr; payload: Fr[]; originBlock: RetractableFactOrigin | undefined };

/** A fact collection whose facts carry origin-block state. */
export type AnnotatedFactCollection = { key: FactCollectionKey; facts: AnnotatedFact[] };

/**
 * Classifies an origin block by number against the chain tips. A surviving retractable fact's origin block is
 * guaranteed canonical (a reorg would have pruned the fact), so a number comparison is sufficient.
 */
export function classifyOriginState(blockNumber: number, tips: TipBlockNumbers): OriginState {
  if (blockNumber <= tips.finalizedBlockNumber) {
    return OriginState.Finalized;
  }
  if (blockNumber <= tips.provenBlockNumber) {
    return OriginState.Proven;
  }
  return OriginState.Pending;
}

/** Enriches a stored fact with the chain state of its origin block (when retractable). */
export function annotateFact(fact: Fact, tips: TipBlockNumbers): AnnotatedFact {
  const originBlock: RetractableFactOrigin | undefined = fact.originBlock
    ? {
        blockNumber: fact.originBlock.blockNumber,
        blockHash: fact.originBlock.blockHash,
        blockState: classifyOriginState(fact.originBlock.blockNumber, tips),
      }
    : undefined;
  return { factTypeId: fact.factTypeId, payload: fact.payload, originBlock };
}

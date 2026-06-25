import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2TipId, L2Tips } from '@aztec/stdlib/block';

import {
  OriginBlockState,
  anchoredTipBlockNumbers,
  classifyOriginBlockState,
  toFactWithOriginState,
} from './origin_state.js';

describe('classifyOriginBlockState', () => {
  const tips = { provenBlockNumber: 10, finalizedBlockNumber: 5 };

  it('classifies a block at or below the finalized tip as Finalized', () => {
    expect(classifyOriginBlockState(5, tips)).toBe(OriginBlockState.Finalized);
    expect(classifyOriginBlockState(3, tips)).toBe(OriginBlockState.Finalized);
  });

  it('classifies a block above finalized but at or below proven as Proven', () => {
    expect(classifyOriginBlockState(6, tips)).toBe(OriginBlockState.Proven);
    expect(classifyOriginBlockState(10, tips)).toBe(OriginBlockState.Proven);
  });

  it('classifies a block above the proven tip as Pending', () => {
    expect(classifyOriginBlockState(11, tips)).toBe(OriginBlockState.Pending);
    expect(classifyOriginBlockState(12, tips)).toBe(OriginBlockState.Pending);
  });
});

describe('toFactWithOriginState', () => {
  const tips = { provenBlockNumber: 10, finalizedBlockNumber: 5 };
  const factTypeId = new Fr(7);
  const payload = [new Fr(1), new Fr(2)];

  it('annotates a retractable fact with its origin block state', () => {
    const blockHash = new Fr(99);
    const annotated = toFactWithOriginState({ factTypeId, payload, originBlock: { blockNumber: 3, blockHash } }, tips);
    expect(annotated).toEqual({
      factTypeId,
      payload,
      originBlock: { blockNumber: 3, blockHash, blockState: OriginBlockState.Finalized },
    });
  });

  it('leaves a non-retractable fact without an origin block', () => {
    const annotated = toFactWithOriginState({ factTypeId, payload, originBlock: undefined }, tips);
    expect(annotated).toEqual({ factTypeId, payload, originBlock: undefined });
  });
});

describe('anchoredTipBlockNumbers', () => {
  const tipId = (n: number): L2TipId => ({
    block: { number: BlockNumber(n), hash: '' },
    checkpoint: { number: CheckpointNumber(0), hash: '' },
  });
  const makeL2Tips = (finalized: number, proven: number): L2Tips => ({
    proposed: { number: BlockNumber(proven), hash: '' },
    checkpointed: tipId(proven),
    proven: tipId(proven),
    finalized: tipId(finalized),
  });

  it('passes the tips through unchanged when the anchor is at or above the proven tip', () => {
    expect(anchoredTipBlockNumbers(makeL2Tips(5, 10), 20)).toEqual({ provenBlockNumber: 10, finalizedBlockNumber: 5 });
    expect(anchoredTipBlockNumbers(makeL2Tips(5, 10), 10)).toEqual({ provenBlockNumber: 10, finalizedBlockNumber: 5 });
  });

  it('caps the proven tip at the anchor while leaving an already-lower finalized tip alone', () => {
    expect(anchoredTipBlockNumbers(makeL2Tips(5, 10), 7)).toEqual({ provenBlockNumber: 7, finalizedBlockNumber: 5 });
  });

  it('caps both tips at the anchor when the anchor is below the finalized tip', () => {
    expect(anchoredTipBlockNumbers(makeL2Tips(5, 10), 3)).toEqual({ provenBlockNumber: 3, finalizedBlockNumber: 3 });
  });

  it('reports an origin block above the anchor as Pending', () => {
    const tips = anchoredTipBlockNumbers(makeL2Tips(5, 10), 6);
    expect(classifyOriginBlockState(7, tips)).toBe(OriginBlockState.Pending);
  });
});

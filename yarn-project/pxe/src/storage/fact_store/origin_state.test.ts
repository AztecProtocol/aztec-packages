import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2TipId, L2Tips } from '@aztec/stdlib/block';

import { OriginState, annotateFact, cappedTipBlockNumbers, classifyOriginState } from './origin_state.js';

describe('classifyOriginState', () => {
  const tips = { provenBlockNumber: 10, finalizedBlockNumber: 5 };

  it('classifies a block at or below the finalized tip as Finalized', () => {
    expect(classifyOriginState(5, tips)).toBe(OriginState.Finalized);
    expect(classifyOriginState(3, tips)).toBe(OriginState.Finalized);
  });

  it('classifies a block above finalized but at or below proven as Proven', () => {
    expect(classifyOriginState(6, tips)).toBe(OriginState.Proven);
    expect(classifyOriginState(10, tips)).toBe(OriginState.Proven);
  });

  it('classifies a block above the proven tip as Pending', () => {
    expect(classifyOriginState(11, tips)).toBe(OriginState.Pending);
    expect(classifyOriginState(12, tips)).toBe(OriginState.Pending);
  });
});

describe('annotateFact', () => {
  const tips = { provenBlockNumber: 10, finalizedBlockNumber: 5 };
  const factTypeId = new Fr(7);
  const payload = [new Fr(1), new Fr(2)];

  it('annotates a retractable fact with its origin block state', () => {
    const blockHash = new Fr(99);
    const annotated = annotateFact({ factTypeId, payload, originBlock: { blockNumber: 3, blockHash } }, tips);
    expect(annotated).toEqual({
      factTypeId,
      payload,
      originBlock: { blockNumber: 3, blockHash, blockState: OriginState.Finalized },
    });
  });

  it('leaves a non-retractable fact without an origin block', () => {
    const annotated = annotateFact({ factTypeId, payload, originBlock: undefined }, tips);
    expect(annotated).toEqual({ factTypeId, payload, originBlock: undefined });
  });
});

describe('cappedTipBlockNumbers', () => {
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
    expect(cappedTipBlockNumbers(makeL2Tips(5, 10), 20)).toEqual({ provenBlockNumber: 10, finalizedBlockNumber: 5 });
    expect(cappedTipBlockNumbers(makeL2Tips(5, 10), 10)).toEqual({ provenBlockNumber: 10, finalizedBlockNumber: 5 });
  });

  it('caps the proven tip at the anchor while leaving an already-lower finalized tip alone', () => {
    expect(cappedTipBlockNumbers(makeL2Tips(5, 10), 7)).toEqual({ provenBlockNumber: 7, finalizedBlockNumber: 5 });
  });

  it('caps both tips at the anchor when the anchor is below the finalized tip', () => {
    expect(cappedTipBlockNumbers(makeL2Tips(5, 10), 3)).toEqual({ provenBlockNumber: 3, finalizedBlockNumber: 3 });
  });

  it('reports an origin block above the anchor as Pending', () => {
    const tips = cappedTipBlockNumbers(makeL2Tips(5, 10), 6);
    expect(classifyOriginState(7, tips)).toBe(OriginState.Pending);
  });
});

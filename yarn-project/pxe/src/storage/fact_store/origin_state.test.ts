import { Fr } from '@aztec/foundation/curves/bn254';

import { OriginState, annotateFact, classifyOriginState } from './origin_state.js';

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

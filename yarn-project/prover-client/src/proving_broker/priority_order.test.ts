import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { PROOF_TYPES_IN_PRIORITY_ORDER } from './proving_broker.js';

describe('PROOF_TYPES_IN_PRIORITY_ORDER', () => {
  it('lists every ProvingRequestType exactly once', () => {
    const expected = Object.values(ProvingRequestType).filter((v): v is ProvingRequestType => typeof v === 'number');
    expect([...PROOF_TYPES_IN_PRIORITY_ORDER].sort()).toEqual([...expected].sort());
    expect(PROOF_TYPES_IN_PRIORITY_ORDER).toHaveLength(new Set(PROOF_TYPES_IN_PRIORITY_ORDER).size);
  });

  it('places BLOCK_EXECUTION at the highest priority — execution gates everything else', () => {
    expect(PROOF_TYPES_IN_PRIORITY_ORDER[0]).toEqual(ProvingRequestType.BLOCK_EXECUTION);
  });
});

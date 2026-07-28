import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';

import { MAX_COMMITTEE_SIZE, MAX_RPC_HEAVY_LEN, MAX_RPC_TXS_LEN } from './api_limit.js';

describe('api limits', () => {
  it('caps attestation responses above the network target committee size', () => {
    expect(DefaultL1ContractsConfig.aztecTargetCommitteeSize).toBeLessThanOrEqual(MAX_COMMITTEE_SIZE);
  });

  it('keeps the heavy-page cap below the element caps it overrides', () => {
    expect(MAX_RPC_HEAVY_LEN).toBeLessThanOrEqual(MAX_RPC_TXS_LEN);
  });
});

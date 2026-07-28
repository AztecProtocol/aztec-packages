import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';

import { MAX_COMMITTEE_SIZE } from './api_limit.js';

describe('api limits', () => {
  it('caps attestation responses above the network target committee size', () => {
    expect(DefaultL1ContractsConfig.aztecTargetCommitteeSize).toBeLessThanOrEqual(MAX_COMMITTEE_SIZE);
  });
});

import { createLogger } from '@aztec/foundation/log';

import { describeAttestationPool } from './attestation_pool_test_suite.js';
import { InMemoryAttestationPool } from './memory_attestation_pool.js';

describe('In-Memory Attestation Pool', () => {
  let inMemoryAttestationPool: InMemoryAttestationPool;
  const logger = createLogger('p2p:test:memory-attestation-pool');

  beforeEach(() => {
    inMemoryAttestationPool = new InMemoryAttestationPool(logger);
  });

  describeAttestationPool(() => inMemoryAttestationPool);
});

import { describeAttestationPool } from './attestation_pool_test_suite.js';
import { InMemoryAttestationPool } from './memory_attestation_pool.js';

describe('In-Memory Attestation Pool', () => {
  let inMemoryAttestationPool: InMemoryAttestationPool;
  beforeEach(() => {
    inMemoryAttestationPool = new InMemoryAttestationPool();
  });

  describeAttestationPool(() => inMemoryAttestationPool);
});

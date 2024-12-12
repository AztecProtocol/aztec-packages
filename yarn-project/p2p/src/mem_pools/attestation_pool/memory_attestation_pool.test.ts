import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { InMemoryAttestationPool } from './memory_attestation_pool.js';
import { describeAttestationPool } from './attestation_pool_test_suite.js';

describe('In-Memory Attestation Pool', () => {
  let inMemoryAttestationPool: InMemoryAttestationPool;
  beforeEach(() => {
    inMemoryAttestationPool = new InMemoryAttestationPool(new NoopTelemetryClient());
  });

  describeAttestationPool(() => inMemoryAttestationPool);
});

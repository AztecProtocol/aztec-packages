
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { describeAttestationPool } from './attestation_pool_test_suite.js';
import { KvAttestationPool } from './kv_attestation_pool.js';
import { AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';

describe('KV Attestation Pool', () => {
  let kvAttestationPool: KvAttestationPool;
  let store: AztecKVStore;

  beforeEach(() => {
    store = openTmpStore();
    kvAttestationPool = new KvAttestationPool(store, new NoopTelemetryClient());
  });

  describeAttestationPool(() => kvAttestationPool);
});

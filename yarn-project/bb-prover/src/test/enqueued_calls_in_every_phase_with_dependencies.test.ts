import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'enqueued calls in every phase, with enqueued calls that depend on each other',
  async () => {
    await proveAndVerifyAvmTestContract(
      /*checkCircuitOnly=*/ true,
      /*setupFunctionNames=*/ ['read_assert_storage_single', 'set_storage_single'],
      /*setupArgs=*/ [[new Fr(0)], [new Fr(5)]],
      /*appFunctionNames=*/ ['read_assert_storage_single', 'set_storage_single'],
      /*appArgs=*/ [[new Fr(5)], [new Fr(10)]],
      /*teardownFunctionName=*/ 'read_assert_storage_single',
      /*teardownArgs=*/ [new Fr(10)],
    );
  },
  TIMEOUT,
);

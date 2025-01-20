import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'Should prove and verify a TX that reverts in teardown',
  async () => {
    await proveAndVerifyAvmTestContract(
      /*checkCircuitOnly=*/ true,
      /*setupFunctionNames=*/ [],
      /*setupArgs=*/ [],
      /*appFunctionNames=*/ [],
      /*appArgs=*/ [],
      /*teardownFunctionName=*/ 'read_assert_storage_single',
      /*teardownArgs=*/ [new Fr(10)],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'top-level exceptional halts in both app logic and teardown',
  async () => {
    await proveAndVerifyAvmTestContract(
      /*checkCircuitOnly=*/ true,
      /*setupFunctionNames=*/ [],
      /*setupArgs=*/ [],
      /*appFunctionNames=*/ ['divide_by_zero'],
      /*appArgs=*/ [[]],
      /*teardownFunctionName=*/ 'divide_by_zero',
      /*teardownArgs=*/ [],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

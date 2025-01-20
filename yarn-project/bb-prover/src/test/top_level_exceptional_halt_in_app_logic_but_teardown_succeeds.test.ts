import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'top-level exceptional halt in app logic, but teardown succeeds',
  async () => {
    await proveAndVerifyAvmTestContract(
      /*checkCircuitOnly=*/ true,
      /*setupFunctionNames=*/ [],
      /*setupArgs=*/ [],
      /*appFunctionNames=*/ ['divide_by_zero'],
      /*appArgs=*/ [[]],
      /*teardownFunctionName=*/ 'add_args_return',
      /*teardownArgs=*/ [new Fr(1), new Fr(2)],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

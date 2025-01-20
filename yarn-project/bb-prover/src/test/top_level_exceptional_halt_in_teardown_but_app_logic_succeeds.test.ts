import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'top-level exceptional halt in teardown, but app logic succeeds',
  async () => {
    await proveAndVerifyAvmTestContract(
      /*checkCircuitOnly=*/ true,
      /*setupFunctionNames=*/ [],
      /*setupArgs=*/ [],
      /*appFunctionNames=*/ ['add_args_return'],
      /*appArgs=*/ [[new Fr(1), new Fr(2)]],
      /*teardownFunctionName=*/ 'divide_by_zero',
      /*teardownArgs=*/ [],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract } from './prove_and_verify.js';

const TIMEOUT = 300_000;

// This test is skipped in the original file due to "Lookup PERM_MAIN_ALU failed."
it.skip(
  'a top-level exceptional halts due to a non-existent contract in app-logic and teardown',
  async () => {
    await proveAndVerifyAvmTestContract(
      /*checkCircuitOnly=*/ true,
      /*setupFunctionNames=*/ [],
      /*setupArgs=*/ [],
      /*appFunctionNames=*/ ['add_args_return'],
      /*appArgs=*/ [[new Fr(1), new Fr(2)]],
      /*teardownFunctionName=*/ 'add_args_return',
      /*teardownArgs=*/ [new Fr(1), new Fr(2)],
      /*expectRevert=*/ true,
      /*skipContractDeployments=*/ true,
    );
  },
  TIMEOUT,
);

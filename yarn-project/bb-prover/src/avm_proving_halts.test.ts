// Split out as otherwise avm_proving.test.ts is longer than 10 minutes.
import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract, proveAndVerifyAvmTestContractSimple } from './avm_proving_test_helpers.js';

const TIMEOUT = 300_000;

describe('AVM WitGen, "check circuit" tests', () => {
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
  it(
    'a nested exceptional halt propagate to top-level',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'external_call_to_divide_by_zero',
        /*args=*/ [],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'a nested exceptional halt is recovered from in caller',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'external_call_to_divide_by_zero_recovers',
        /*args=*/ [],
        /*expectRevert=*/ false,
      );
    },
    TIMEOUT,
  );
  it(
    'an exceptional halt due to a nested call to non-existent contract is propagated to top-level',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'nested_call_to_nothing',
        /*args=*/ [],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'an exceptional halt due to a nested call to non-existent contract is recovered from in caller',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'nested_call_to_nothing_recovers',
        /*args=*/ [],
        /*expectRevert=*/ false,
      );
    },
    TIMEOUT,
  );
  // FIXME(dbanks12): fails with "Lookup PERM_MAIN_ALU failed."
  it.skip('a top-level exceptional halts due to a non-existent contract in app-logic and teardown', async () => {
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
  });
});

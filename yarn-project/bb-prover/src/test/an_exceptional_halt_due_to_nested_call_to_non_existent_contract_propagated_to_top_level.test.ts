import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

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

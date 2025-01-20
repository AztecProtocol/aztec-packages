import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

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

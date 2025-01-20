import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

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

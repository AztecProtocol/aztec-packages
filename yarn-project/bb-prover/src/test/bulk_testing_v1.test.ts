import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'bulk_testing v1',
  async () => {
    await proveAndVerifyAvmTestContractSimple(
      /*checkCircuitOnly=*/ false, // full proving & verifying
      'bulk_testing',
      /*args=*/ [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x)),
    );
  },
  TIMEOUT,
);

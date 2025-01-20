import { MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'perform too many storage writes and revert',
  async () => {
    await proveAndVerifyAvmTestContractSimple(
      /*checkCircuitOnly=*/ true, // quick
      'n_storage_writes',
      /*args=*/ [new Fr(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1)],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

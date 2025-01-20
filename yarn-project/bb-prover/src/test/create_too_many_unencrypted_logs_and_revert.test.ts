import { MAX_UNENCRYPTED_LOGS_PER_TX } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'create too many unencrypted logs and revert',
  async () => {
    await proveAndVerifyAvmTestContractSimple(
      /*checkCircuitOnly=*/ true, // quick
      'n_new_unencrypted_logs',
      /*args=*/ [new Fr(MAX_UNENCRYPTED_LOGS_PER_TX + 1)],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

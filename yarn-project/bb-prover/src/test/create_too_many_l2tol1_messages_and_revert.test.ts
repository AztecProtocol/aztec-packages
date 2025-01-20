import { MAX_L2_TO_L1_MSGS_PER_TX } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'create too many l2tol1 messages and revert',
  async () => {
    await proveAndVerifyAvmTestContractSimple(
      /*checkCircuitOnly=*/ true, // quick
      'n_new_l2_to_l1_msgs',
      /*args=*/ [new Fr(MAX_L2_TO_L1_MSGS_PER_TX + 1)],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

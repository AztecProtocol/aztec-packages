import { MAX_NOTE_HASHES_PER_TX } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'create too many note hashes and revert',
  async () => {
    await proveAndVerifyAvmTestContractSimple(
      /*checkCircuitOnly=*/ true, // quick
      'n_new_note_hashes',
      /*args=*/ [new Fr(MAX_NOTE_HASHES_PER_TX + 1)],
      /*expectRevert=*/ true,
    );
  },
  TIMEOUT,
);

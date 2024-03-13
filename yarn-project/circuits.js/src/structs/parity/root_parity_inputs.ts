import { Tuple } from '@aztec/foundation/serialize';

import { NUM_BASE_PARITY_PER_ROOT_PARITY } from '../../constants.gen.js';
import { RootParityInput } from './root_parity_input.js';

export class RootParityInputs {
  constructor(
    /** Public inputs of children and their proofs. */
    public readonly children: Tuple<RootParityInput, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
  ) {}
}

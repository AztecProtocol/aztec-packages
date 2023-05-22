import { serializeToBuffer } from '../../utils/serialize.js';
import { PreviousRollupData } from './previous_rollup_data.js';

/**
 * Represents inputs of the merge rollup circuit.
 */
export class MergeRollupInputs {
  constructor(
    /**
     * Previous rollup data from the 2 merge or base rollup circuits that preceded this merge rollup circuit.
     */
    public previousRollupData: [PreviousRollupData, PreviousRollupData],
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousRollupData);
  }
}

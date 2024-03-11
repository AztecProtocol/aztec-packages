import { Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { FieldsOf } from '@aztec/foundation/types';

import { AggregationObject } from '../aggregation_object.js';

export class ParityPublicInputs {
  constructor(
    /** Aggregated proof of all the parity circuit iterations. */
    public readonly aggregationObject: AggregationObject,
    /** Root of the SHA256 tree. */
    public readonly shaRoot: Buffer,
    /** Root of the converted tree. */
    public readonly convertedRoot: Fr,
  ) {
    if (shaRoot.length !== 32) {
      throw new Error(`shaRoot buffer must be 32 bytes. Got ${shaRoot.length} bytes`);
    }
  }

  toBuffer() {
    return serializeToBuffer(...ParityPublicInputs.getFields(this));
  }

  static from(fields: FieldsOf<ParityPublicInputs>): ParityPublicInputs {
    return new ParityPublicInputs(...ParityPublicInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<ParityPublicInputs>) {
    return [fields.aggregationObject, fields.shaRoot, fields.convertedRoot] as const;
  }
}

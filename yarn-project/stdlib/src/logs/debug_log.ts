import { Fr } from '@aztec/foundation/curves/bn254';
import { type LogLevel, LogLevels } from '@aztec/foundation/log';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

/*
 * Represents a debug log emitted by public bytecode.
 */
export class DebugLog {
  constructor(
    public contractAddress: AztecAddress,
    public level: LogLevel,
    public message: string,
    public fields: Fr[],
  ) {}

  static get schema(): ZodFor<DebugLog> {
    return z
      .object({
        contractAddress: AztecAddress.schema,
        level: z.enum(LogLevels),
        message: z.string(),
        fields: z.array(schemas.Fr),
      })
      .transform(
        ({ contractAddress, level, message, fields }) => new DebugLog(contractAddress, level, message, fields),
      );
  }

  /**
   * Creates a DebugLog from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing DebugLog fields
   * @returns A DebugLog instance
   */
  static fromPlainObject(obj: any): DebugLog {
    if (obj instanceof DebugLog) {
      return obj;
    }
    return new DebugLog(
      AztecAddress.fromPlainObject(obj.contractAddress),
      obj.level,
      obj.message,
      obj.fields.map((f: any) => Fr.fromPlainObject(f)),
    );
  }
}

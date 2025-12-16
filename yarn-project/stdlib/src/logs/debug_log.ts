import type { Fr } from '@aztec/foundation/fields';
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
}

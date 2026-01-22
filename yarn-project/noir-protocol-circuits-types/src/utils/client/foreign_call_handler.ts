import { Fr } from '@aztec/foundation/curves/bn254';
import { LogLevels, type Logger, applyStringFormatting } from '@aztec/foundation/log';
import type { ForeignCallInput, ForeignCallOutput } from '@aztec/noir-acvm_js';

import { strict as assert } from 'assert';

/** Type for the foreign call handler function. */
export type ForeignCallHandler = (name: string, args: ForeignCallInput[]) => Promise<ForeignCallOutput[]>;

/**
 * Creates a foreign call handler for client-side protocol circuits.
 * @param log - Logger to use for debug output.
 * @returns A foreign call handler function.
 */
export function makeForeignCallHandler(log: Logger): ForeignCallHandler {
  return function foreignCallHandler(name: string, args: ForeignCallInput[]): Promise<ForeignCallOutput[]> {
    // ForeignCallInput is actually a string[], so the args are string[][].
    if (name === 'utilityDebugLog') {
      assert(args.length === 4, 'expected 4 arguments for debugLog: level, msg, fields_length, fields');
      const [levelInput, msgRaw, _ignoredFieldsSize, fields] = args;
      const levelNumber = Fr.fromString(levelInput[0]).toNumber();
      if (!LogLevels[levelNumber]) {
        throw new Error(`Invalid debug log level: ${levelNumber}`);
      }
      const level = LogLevels[levelNumber];
      const msg: string = msgRaw.map(acvmField => String.fromCharCode(Fr.fromString(acvmField).toNumber())).join('');
      const fieldsFr: Fr[] = fields.map((field: string) => Fr.fromString(field));
      log[level]('debug_log ' + applyStringFormatting(msg, fieldsFr));
    } else if (name === 'noOp') {
      // Workaround for compiler issues where data is deleted because it's "unused"
    } else {
      throw Error(`unexpected oracle during execution: ${name}`);
    }

    return Promise.resolve([]);
  };
}

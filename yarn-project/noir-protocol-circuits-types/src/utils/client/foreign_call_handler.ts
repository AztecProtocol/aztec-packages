import { Fr } from '@aztec/foundation/fields';
import { LogLevels, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import type { ForeignCallInput, ForeignCallOutput } from '@aztec/noir-acvm_js';

import { strict as assert } from 'assert';

export function foreignCallHandler(name: string, args: ForeignCallInput[]): Promise<ForeignCallOutput[]> {
  // ForeignCallInput is actually a string[], so the args are string[][].
  const log = createLogger('noir-protocol-circuits:oracle');

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
}

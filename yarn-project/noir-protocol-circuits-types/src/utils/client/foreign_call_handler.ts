import { Fr } from '@aztec/circuits.js';
import { applyStringFormatting, createLogger } from '@aztec/foundation/log';

import { type ForeignCallInput, type ForeignCallOutput } from '@noir-lang/acvm_js';
import { strict as assert } from 'assert';

function fromACVMField(field: string): Fr {
  return Fr.fromBuffer(Buffer.from(field.slice(2), 'hex'));
}

function toACVMField(field: Fr): string {
  return `0x${field.toBuffer().toString('hex')}`;
}

export function foreignCallHandler(name: string, args: ForeignCallInput[]): Promise<ForeignCallOutput[]> {
  // ForeignCallInput is actually a string[], so the args are string[][].
  const log = createLogger('noir-protocol-circuits:oracle');

  if (name === 'debugLog') {
    assert(args.length === 3, 'expected 3 arguments for debugLog: msg, fields_length, fields');
    const [msgRaw, _ignoredFieldsSize, fields] = args;
    const msg: string = msgRaw.map(acvmField => String.fromCharCode(fromACVMField(acvmField).toNumber())).join('');
    const fieldsFr: Fr[] = fields.map((field: string) => fromACVMField(field));
    log.verbose('debug_log ' + applyStringFormatting(msg, fieldsFr));
  } else {
    throw Error(`unexpected oracle during execution: ${name}`);
  }

  return Promise.resolve([]);
}

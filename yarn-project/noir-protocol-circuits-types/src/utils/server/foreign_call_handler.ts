import { Fr } from '@aztec/circuits.js';
import { BlockBlobPublicInputs, SpongeBlob } from '@aztec/circuits.js/blobs';
import { Blob } from '@aztec/foundation/blob';
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
  } else if (name === 'evaluateBlobs') {
    // TODO(#10323): this was added to save simulation time (~1min in ACVM, ~3mins in wasm -> 500ms).
    // The use of bignum adds a lot of unconstrained code which overloads limits when simulating.
    // If/when simulation times of unconstrained are improved, remove this.
    // Create and evaulate our blobs:
    const paddedBlobsAsFr: Fr[] = args[0].map((field: string) => fromACVMField(field));
    const kzgCommitments = args[1].map((field: string) => fromACVMField(field));
    const spongeBlob = SpongeBlob.fromFields(
      args
        .slice(2)
        .flat()
        .map((field: string) => fromACVMField(field)),
    );
    const blobsAsFr = paddedBlobsAsFr.slice(0, spongeBlob.expectedFields);
    // NB: the above used to be:
    // const blobsAsFr: Fr[] = args[0].map((field: string) => fromACVMField(field)).filter(field => !field.isZero());
    // ...but we now have private logs which have a fixed number of fields and may have 0 values.
    // TODO(Miranda): trim 0 fields from private logs
    const blobs = Blob.getBlobs(blobsAsFr);
    const blobPublicInputs = BlockBlobPublicInputs.fromBlobs(blobs);
    // Checks on injected values:
    const hash = spongeBlob.squeeze();
    blobs.forEach((blob, i) => {
      const injected = kzgCommitments.slice(2 * i, 2 * i + 2);
      const calculated = blob.commitmentToFields();
      if (!calculated[0].equals(injected[0]) || !calculated[1].equals(injected[1])) {
        throw new Error(`Blob commitment mismatch. Real: ${calculated}, Injected: ${injected}`);
      }
      if (!hash.equals(blob.fieldsHash)) {
        throw new Error(
          `Injected blob fields do not match rolled up fields. Real hash: ${hash}, Injected hash: ${blob.fieldsHash}`,
        );
      }
    });
    return Promise.resolve([blobPublicInputs.toFields().map(toACVMField)]);
  } else {
    throw Error(`unexpected oracle during execution: ${name}`);
  }

  return Promise.resolve([]);
}

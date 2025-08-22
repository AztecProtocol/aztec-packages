import { Blob, BlobAccumulatorPublicInputs, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import {
  BLOB_ACCUMULATOR_PUBLIC_INPUTS,
  BLS12_FQ_LIMBS,
  BLS12_FR_LIMBS,
  BLS12_POINT,
  FIELDS_PER_BLOB,
} from '@aztec/constants';
import { chunk } from '@aztec/foundation/collection';
import { BLS12Fq, BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { applyStringFormatting, createLogger } from '@aztec/foundation/log';
import type { ForeignCallInput, ForeignCallOutput } from '@aztec/noir-acvm_js';

import { strict as assert } from 'assert';

export async function foreignCallHandler(name: string, args: ForeignCallInput[]): Promise<ForeignCallOutput[]> {
  // ForeignCallInput is actually a string[], so the args are string[][].
  const log = createLogger('noir-protocol-circuits:oracle');

  if (name === 'debugLog') {
    assert(args.length === 3, 'expected 3 arguments for debugLog: msg, fields_length, fields');
    const [msgRaw, _ignoredFieldsSize, fields] = args;
    const msg: string = msgRaw.map(acvmField => String.fromCharCode(Fr.fromString(acvmField).toNumber())).join('');
    const fieldsFr: Fr[] = fields.map((field: string) => Fr.fromString(field));
    log.verbose('debug_log ' + applyStringFormatting(msg, fieldsFr));
  } else if (name === 'evaluateBlobs') {
    // Args are nested arrays with a max depth of one. If structs change using these nested arrays will break =>
    // we flatten all inputs and use constants.
    const flattenedArgs = args.flat();
    let offset = 0;
    // TODO(#10323): this was added to save simulation time (~1min in ACVM, ~3mins in wasm -> 500ms).
    // The use of bignum adds a lot of unconstrained code which overloads limits when simulating.
    // If/when simulation times of unconstrained are improved, remove this.
    // Create and evaluate our blobs:

    // - args[0] is the number of blobs.
    const numBlobs = parseInt(flattenedArgs[offset++]);

    //  - args[1] is an array of raw blob fields:
    const paddedBlobsAsFr: Fr[] = flattenedArgs
      .slice(offset, (offset += FIELDS_PER_BLOB * numBlobs))
      .map((field: string) => Fr.fromString(field));

    // - args[2] is the number of blob fields.
    const numBlobFields = parseInt(flattenedArgs[offset++]);

    // - args[3] is the expected hash of the blob fields.
    const expectedBlobFieldsHash = Fr.fromString(flattenedArgs[offset++]);

    //  - args[4] is an array of numBlobs commitments, which are BLS12_381 points: {x: bignum, y: bignum, is_inf: bool}
    // TODO(#14646): Omit/compress some fields to reduce number of public inputs & outputs here?
    const kzgCommitmentsFields = chunk(flattenedArgs.slice(offset, (offset += BLS12_POINT * numBlobs)), BLS12_POINT);
    const kzgCommitments = kzgCommitmentsFields.map(fields => {
      const x = BLS12Fq.fromNoirBigNum({ limbs: fields.slice(0, BLS12_FQ_LIMBS) });
      const y = BLS12Fq.fromNoirBigNum({
        limbs: fields.slice(BLS12_FQ_LIMBS, BLS12_FQ_LIMBS * 2),
      });
      const isInfinite = Fr.fromString(fields[BLS12_FQ_LIMBS * 2]).toBool();
      return new BLS12Point(x, y, isInfinite);
    });

    // - args[5] is the challenges struct, containing z (BNFr) and gamma (BLS12Fr)
    // TODO(#14646): Omit/compress some fields to reduce number of public inputs & outputs here?
    const finalBlobChallenges = new FinalBlobBatchingChallenges(
      Fr.fromString(flattenedArgs[offset++]),
      BLS12Fr.fromNoirBigNum({ limbs: flattenedArgs.slice(offset, (offset += BLS12_FR_LIMBS)) }),
    );

    // - args[6] is the start blob batching accumulator
    // TODO(#14646): Omit/compress some fields to reduce number of public inputs & outputs here?
    const startBlobAccumulatorFields = flattenedArgs.slice(offset, (offset += BLOB_ACCUMULATOR_PUBLIC_INPUTS));
    const startBlobAccumulator = BlobAccumulatorPublicInputs.fromFields(startBlobAccumulatorFields.map(Fr.fromString));

    const blobsAsFr = paddedBlobsAsFr.slice(0, numBlobFields);
    const blobs = await Blob.getBlobsPerBlock(blobsAsFr);
    blobs.forEach((blob, i) => {
      const injected = kzgCommitments[i];
      const calculated = BLS12Point.decompress(blob.commitment);
      if (!calculated.equals(injected)) {
        throw new Error(`Blob commitment mismatch. Real: ${calculated}, Injected: ${injected}`);
      }
      if (!expectedBlobFieldsHash.equals(blob.fieldsHash)) {
        throw new Error(
          `Injected blob fields do not match rolled up fields. Real hash: ${expectedBlobFieldsHash}, Injected hash: ${blob.fieldsHash}`,
        );
      }
    });
    const endBlobAccumulator = await startBlobAccumulator.accumulateBlobs(blobs, finalBlobChallenges);
    return Promise.resolve([endBlobAccumulator.toFields().map(field => field.toString())]);
  } else if (name === 'noOp') {
    // Workaround for compiler issues where data is deleted because it's "unused"
  } else {
    throw Error(`unexpected oracle during execution: ${name}`);
  }

  return Promise.resolve([]);
}

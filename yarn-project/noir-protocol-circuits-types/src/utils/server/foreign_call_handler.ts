import { Blob, BlobAccumulatorPublicInputs, FinalBlobBatchingChallenges, SpongeBlob } from '@aztec/blob-lib';
import {
  BLOBS_PER_BLOCK,
  BLOB_ACCUMULATOR_PUBLIC_INPUTS,
  BLS12_FQ_LIMBS,
  BLS12_FR_LIMBS,
  BLS12_POINT,
  FIELDS_PER_BLOB,
  SPONGE_BLOB_LENGTH,
} from '@aztec/constants';
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
    //  - args[0] is an array of raw blob fields:
    const paddedBlobsAsFr: Fr[] = flattenedArgs
      .slice(offset, (offset += FIELDS_PER_BLOB * BLOBS_PER_BLOCK))
      .map((field: string) => Fr.fromString(field));
    //  - args[1] is an array of BLOBS_PER_BLOCK commitments, which are BLS12_381 points: {x: bignum, y: bignum, is_inf: bool}
    // TODO(#14646): Omit/compress some fields to reduce number of public inputs & outputs here?
    const kzgCommitmentsFields = flattenedArgs.slice(offset, (offset += BLS12_POINT * BLOBS_PER_BLOCK));
    const kzgCommitments: BLS12Point[] = [];
    for (let i = 0; i < kzgCommitmentsFields.length; i += BLS12_POINT) {
      const x = BLS12Fq.fromNoirBigNum({ limbs: kzgCommitmentsFields.slice(i, i + BLS12_FQ_LIMBS) });
      const y = BLS12Fq.fromNoirBigNum({
        limbs: kzgCommitmentsFields.slice(i + BLS12_FQ_LIMBS, i + BLS12_FQ_LIMBS * 2),
      });
      const isInfinite = Fr.fromString(kzgCommitmentsFields[i + BLS12_FQ_LIMBS * 2]).toBool();
      kzgCommitments.push(new BLS12Point(x, y, isInfinite));
    }

    // - args[2] is the spongeblob accumulator
    const spongeBlob = SpongeBlob.fromFields(
      flattenedArgs
        .slice(offset, (offset += SPONGE_BLOB_LENGTH))
        .flat()
        .map((field: string) => Fr.fromString(field)),
    );
    // - args[3] is the challenges struct, containing z (BNFr) and gamma (BLS12Fr)
    // TODO(#14646): Omit/compress some fields to reduce number of public inputs & outputs here?
    const finalBlobChallenges = new FinalBlobBatchingChallenges(
      Fr.fromString(flattenedArgs[offset++]),
      BLS12Fr.fromNoirBigNum({ limbs: flattenedArgs.slice(offset, (offset += BLS12_FR_LIMBS)) }),
    );

    // - args[4] is the start blob batching accumulator
    // TODO(#14646): Omit/compress some fields to reduce number of public inputs & outputs here?
    const startBlobAccumulatorFields = flattenedArgs.slice(offset, (offset += BLOB_ACCUMULATOR_PUBLIC_INPUTS));
    const startBlobAccumulator = BlobAccumulatorPublicInputs.fromFields(startBlobAccumulatorFields.map(Fr.fromString));

    const blobsAsFr = paddedBlobsAsFr.slice(0, spongeBlob.expectedFields);
    // NB: the above used to be:
    // const blobsAsFr: Fr[] = args[0].map((field: string) => Fr.fromString(field)).filter(field => !field.isZero());
    // ...but we now have private logs which have a fixed number of fields and may have 0 values.
    // TODO(Miranda): trim 0 fields from private logs
    const blobs = await Blob.getBlobsPerBlock(blobsAsFr);
    // Checks on injected values:
    const hash = await spongeBlob.squeeze();
    blobs.forEach((blob, i) => {
      const injected = kzgCommitments[i];
      const calculated = BLS12Point.decompress(blob.commitment);
      if (!calculated.equals(injected)) {
        throw new Error(`Blob commitment mismatch. Real: ${calculated}, Injected: ${injected}`);
      }
      if (!hash.equals(blob.fieldsHash)) {
        throw new Error(
          `Injected blob fields do not match rolled up fields. Real hash: ${hash}, Injected hash: ${blob.fieldsHash}`,
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

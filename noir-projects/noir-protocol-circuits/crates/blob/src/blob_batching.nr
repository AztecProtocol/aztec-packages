use crate::{
    abis::{
        BatchingBlobCommitment, BlobAccumulationInputs, BlobAccumulator, BLSPoint,
        FinalBlobBatchingChallenges,
    },
    blob::barycentric_evaluate_blob_at_z,
    utils::compress_to_blob_commitment,
};
use bignum::BLS12_381_Fr;
use types::{
    constants::FIELDS_PER_BLOB,
    hash::{poseidon2_hash, poseidon2_hash_subarray},
    traits::Empty,
    utils::arrays::{assert_trailing_zeros, subarray},
};

// Evaluates a single blob:
// - Evaluates the blob at shared challenge z and returns result y_i
// - Calculates this blob's challenge z_i (= H(H(blob_i), C_i)), where C_i = kzg_commitment, and blob_i = blob_as_fields[i].
fn evaluate_blob_for_batching(
    blob_as_fields: [Field; FIELDS_PER_BLOB],
    kzg_commitment: BatchingBlobCommitment,
    hashed_blobs_fields: Field,
    challenge_z: Field,
) -> (Field, BLS12_381_Fr) {
    let challenge_z_as_bignum = BLS12_381_Fr::from(challenge_z);
    let blob = blob_as_fields.map(|b| BLS12_381_Fr::from(b));

    let y_i = barycentric_evaluate_blob_at_z(challenge_z_as_bignum, blob);
    let z_i = compute_blob_challenge(hashed_blobs_fields, kzg_commitment);

    (z_i, y_i)
}

// Computes challenge for a single blob:
// - z_i (= H(H(blob_i), C_i)), where C_i = kzg_commitment, and blob_i = blob_as_fields[i].
fn compute_blob_challenge(
    hashed_blobs_fields: Field,
    kzg_commitment: BatchingBlobCommitment,
) -> Field {
    let compressed_fields = kzg_commitment.to_compressed_fields();
    let preimage = [hashed_blobs_fields, compressed_fields[0], compressed_fields[1]];
    let challenge = poseidon2_hash(preimage);
    challenge
}

/// Evaluates each blob required for an L1 block:
/// - Hashes the first `num_fields` fields in `blobs_as_fields` (to use for the challenges `z_i`).
/// - Checks that all fields above `num_fields` are zero.
/// - Compresses each of the blob's injected commitments.
/// - Evaluates each blob individually to find its challenge `z_i` and evaluation `y_i`.
/// - Updates the batched blob accumulator.
pub fn evaluate_blobs_and_batch<let NumBlobs: u32>(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * NumBlobs],
    num_fields: u32,
    kzg_commitments_points: [BLSPoint; NumBlobs],
    final_blob_challenges: FinalBlobBatchingChallenges,
    start_accumulator: BlobAccumulator,
) -> (BlobAccumulator, Field) {
    // Note that with multiple blobs per block, each blob uses the same hashed_blobs_fields in:
    // z_i = H(hashed_blobs_fields, kzg_commitment[0], kzg_commitment[1])
    // This is ok, because each commitment is unique to the blob, and we need hashed_blobs_fields to encompass
    // all fields in the blob, which it does.
    let hashed_blobs_fields = poseidon2_hash_subarray(blobs_as_fields, num_fields);

    // The actual content to commit to is the first `num_fields` fields. All fields after `num_fields` must be zero.
    assert_trailing_zeros(blobs_as_fields, num_fields);

    let mut end_accumulator = start_accumulator;
    for i in 0..NumBlobs {
        let single_blob_fields = subarray(blobs_as_fields, i * FIELDS_PER_BLOB);
        let c_i = compress_to_blob_commitment(kzg_commitments_points[i]);
        let (z_i, y_i) = evaluate_blob_for_batching(
            single_blob_fields,
            c_i,
            hashed_blobs_fields,
            final_blob_challenges.z,
        );

        // Accumulate ceil(num_fields / FIELDS_PER_BLOB) blobs.
        //
        // Note:
        // - We can't rely on `y_i.is_zero()` to decide whether to accumulate. A blob may legitimately contain only
        //   zeros (e.g. from a contract class log or public log).
        //   - If we skip such an "empty" blob, the hash check on L1 would fail.
        //   - If we remove the zeros entirely, it will be difficult to reconstruct the tx effects correctly.
        // - We can't use `c_i` because it's injected as a hint. Its value should match what's computed from the blobs
        //   submitted to L1, so it cannot be used here to decide whether to accumulate/submit a blob or not.
        // - We can't use `z_i` either, because `z_i` relies on the `hashed_blobs_fields`, which is the hash of the
        //   items in ALL blobs, not just blob `i`.
        let should_accumulate = i * FIELDS_PER_BLOB < num_fields;
        if should_accumulate {
            if (i == 0) & start_accumulator.is_empty() {
                // Call `init` if it starts from an empty accumulator. This must always occur at blob i = 0 in the first
                // checkpoint of an epoch (and nowhere else).
                //  - The root rollup ensures the left input's start accumulator is empty.
                //  - The end accumulator of the first checkpoint won't be empty, because each checkpoint has at least
                //    one block, and every block (including empty block) adds a non-zero `block_end_marker` to the blob.
                //  - No other accumulators can be empty since each checkpoint_merge rollup enforces that left end
                //    accumulator equals right start accumulator.
                end_accumulator = BlobAccumulator::init(
                    BlobAccumulationInputs { z_i, y_i, c_i },
                    final_blob_challenges.gamma,
                );
            } else {
                end_accumulator = end_accumulator.accumulate(
                    BlobAccumulationInputs { z_i, y_i, c_i },
                    final_blob_challenges.gamma,
                );
            }
        }
    }

    (end_accumulator, hashed_blobs_fields)
}

mod tests {
    use crate::{
        abis::{BatchingBlobCommitment, BlobAccumulator, FinalBlobBatchingChallenges},
        utils::{compress_to_blob_commitment, validate_final_blob_batching_challenges},
    };
    use super::evaluate_blobs_and_batch;
    use bigcurve::{BigCurve, curves::bls12_381::BLS12_381 as BLSPoint};
    use bignum::{BigNum, BLS12_381_Fr};
    use types::{
        abis::sponge_blob::SpongeBlob,
        constants::{BLOBS_PER_BLOCK, FIELDS_PER_BLOB},
        hash::sha256_to_field,
        tests::utils::{pad_end, pad_end_with},
        traits::Empty,
    };

    #[test]
    unconstrained fn test_1_blob_batched() {
        // We evaluate 1 blob of 400 items using the batch methods.
        // This ensures a block with a single blob will work:
        let num_fields = 400;
        let mut blob_fields: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        blob_fields[0] = num_fields as Field;
        for i in 1..num_fields {
            blob_fields[i] = 123 + i as Field;
        }
        let mut sponge_blob = SpongeBlob::new(num_fields);
        sponge_blob.absorb(blob_fields, num_fields);

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob_batching.test.ts
        let kzg_commitment_x_limbs_blob_400_from_ts = [
            0x8b9c1e9dea782e77a94559570d726b,
            0x6510d305e77c55eafa3df793f3e54b,
            0x9bbd0431a12abb16dec8ff3f9f7924,
            0x01244f,
        ];
        let kzg_commitment_y_limbs_blob_400_from_ts = [
            0x66f9b580f1b358314be2e2d470c8d1,
            0x065991b6d22c7001c84c0f8aaa55e9,
            0x1cb30e23e49b86d077261e9adcdadf,
            0x0ecea4,
        ];
        let z_blob_400_from_ts = 0x1ccc6dbe74f3b2c36d52e71f3126367fd3dddfb69b61ed0107a067788ae333db;
        let gamma_limbs_blob_400_from_ts =
            [0xdf44cb57082cdb564b5697237de17e, 0x4c3ce597a602a46166a14caa772b70, 0x23d7];
        let y_limbs_blob_400_from_ts =
            [0x33c2aa0a43e57d5d1423a076506f74, 0x68bfe6ec3340004b378b92c9e39d05, 0x0c11];

        let kzg_commitment = BatchingBlobCommitment::from_limbs(
            kzg_commitment_x_limbs_blob_400_from_ts,
            kzg_commitment_y_limbs_blob_400_from_ts,
        )
            .point;

        let final_challenges = FinalBlobBatchingChallenges {
            // = z_0
            z: z_blob_400_from_ts,
            // = H(y_0, z_0)
            gamma: BLS12_381_Fr::from_limbs(gamma_limbs_blob_400_from_ts),
        };

        // Evaluation: Can evaluate up to 3 blobs, but only 1 is needed and will be accumulated.
        let (res, hashed_blobs_fields) = evaluate_blobs_and_batch::<3>(
            pad_end(blob_fields),
            num_fields,
            pad_end_with([kzg_commitment], BLSPoint::point_at_infinity()),
            final_challenges,
            BlobAccumulator::empty(),
        );

        assert_eq(hashed_blobs_fields, sponge_blob.squeeze());

        validate_final_blob_batching_challenges(res, final_challenges);

        let final_acc = res.finalize();

        assert_eq(final_acc.z, final_challenges.z);
        // Since i = 1, gamma_pow = gamma^1 = gamma:
        assert_eq(res.gamma_pow_acc, final_challenges.gamma);

        assert_eq(final_acc.y, BLS12_381_Fr::from_limbs(y_limbs_blob_400_from_ts));

        let blob_commitment = compress_to_blob_commitment(kzg_commitment);

        // Since i = 1, blob_commitments_hash is just the sha256 hash of the single (compressed) commitment
        let expected_blob_commitments_hash = sha256_to_field(blob_commitment.compressed);
        assert_eq(final_acc.blob_commitments_hash, expected_blob_commitments_hash);

        // Since i = 1, C = gamma^0 * C_0 = C_0
        assert_eq(final_acc.c, blob_commitment.to_compressed_fields());
    }

    #[test]
    unconstrained fn test_3_blobs_batched() {
        // Create 2 full blobs and 1 blob with 123 fields.
        let num_fields = FIELDS_PER_BLOB * 2 + 123;
        // Fill three blobs completely with different values (to avoid a constant polynomial)
        let mut blob_fields = [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK];
        blob_fields[0] = num_fields as Field;
        for i in 1..num_fields {
            blob_fields[i] = 456 + i as Field;
        }

        // Absorb the values into a sponge
        let mut sponge_blob = SpongeBlob::new(num_fields);
        sponge_blob.absorb(blob_fields, num_fields);

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob_batching.test.ts
        let kzg_commitment_x_limbs_blob_0_from_ts = [
            0xd7ecb979c36d078b55d1b1fb1108b8,
            0xa823d630d8b78759e51625dcd1fb47,
            0x35c925ae7c0b8af74322de059db6c1,
            0x08c410,
        ];
        let kzg_commitment_y_limbs_blob_0_from_ts = [
            0x00c8fd5a60c016790b5a214b70ee1d,
            0x7ef5cf4f65e3ddf97165baa7cf4ffc,
            0xb929ae54ab3a8c9da6dc90d02b8d9c,
            0x0ad6b4,
        ];
        let kzg_commitment_x_limbs_blob_1_from_ts = [
            0xab3ed5948aa3d00fe77b1b2876ecd7,
            0x9d649e59ee9920f46f5f586bc9f6cb,
            0x001f300677e564710b67c3ef2b1f46,
            0x0ac039,
        ];
        let kzg_commitment_y_limbs_blob_1_from_ts = [
            0xaa5703192a3733107a7f7ba1fa98ce,
            0xc67513549bde2e39d6b6607670cd6b,
            0x0727a2b1e640aec8dbc7709a0c38be,
            0x13ed3a,
        ];
        let kzg_commitment_x_limbs_blob_2_from_ts = [
            0x2d936449435dd85db10daa4a93572a,
            0xba75b7a0c3065ee47dd17fa801cbcb,
            0x308ba7a7145cd3d90a7801a23f0f6b,
            0x0d4847,
        ];
        let kzg_commitment_y_limbs_blob_2_from_ts = [
            0x5a51aa53fad565ecb91d04288a3a1b,
            0xbd1bfcd6b075c4749ddf4251b4028c,
            0x59dcc1d2a509604b557950b349a9f5,
            0x0c6b4d,
        ];
        let z_3_blobs_from_ts = 0x171ded8c78a90f027b2f851f7632201ae43c2e1a53736e28f5d250a2f960c244;
        let gamma_limbs_3_blobs_from_ts =
            [0x9a8371b452f23e2cfd836b3c52d376, 0x4b53051d9cb9000535d20db7a60654, 0x2208];
        let y_limbs_3_blobs_from_ts =
            [0x837f44d9eea6c580f48caff8e9d367, 0x43d4808e38ca8eb79c7e45b86112d1, 0x6675];
        let batched_c_x_limbs_3_blobs_from_ts = [
            0xb2289cba95de61292f5b1fb469f3ce,
            0xf3d2b50a15cf1dc5955ada6e1a0afe,
            0x8dd78590d3c6f9afbabbe2aee9767e,
            0x19ce65,
        ];
        let batched_c_y_limbs_3_blobs_from_ts = [
            0x79a6292da504c2b3dd6bf7969cfebe,
            0x6b5ae4f128144e5f7c56ec6dd3549e,
            0x013e3ce081b1ba8ef61665cf285526,
            0x092cac,
        ];
        let blob_commitments_hash_3_blobs_from_ts =
            0x00f607a4f19d7226c80b3ea468e0323f8d1a713c9ee64813d7518243013acf15;

        // Init. injected values:
        // - Commitments are injected and checked for correctness on L1 via acc.v
        let kzg_commitments_in = [
            BatchingBlobCommitment::from_limbs(
                kzg_commitment_x_limbs_blob_0_from_ts,
                kzg_commitment_y_limbs_blob_0_from_ts,
            )
                .point,
            BatchingBlobCommitment::from_limbs(
                kzg_commitment_x_limbs_blob_1_from_ts,
                kzg_commitment_y_limbs_blob_1_from_ts,
            )
                .point,
            BatchingBlobCommitment::from_limbs(
                kzg_commitment_x_limbs_blob_2_from_ts,
                kzg_commitment_y_limbs_blob_2_from_ts,
            )
                .point,
        ];

        let final_challenges = FinalBlobBatchingChallenges {
            // - The final z value is injected and checked for correctness in root (see below final_acc)
            z: z_3_blobs_from_ts,
            // - The final gamma value is injected and checked for correctness in root (see below final_acc)
            gamma: BLS12_381_Fr::from_limbs(gamma_limbs_3_blobs_from_ts),
        };
        // Init. the accumulator
        let start_acc = BlobAccumulator::empty();
        // Evaluate all three blobs and iteratively accumulate the results
        let (output, hashed_blobs_fields) = evaluate_blobs_and_batch(
            blob_fields,
            num_fields,
            kzg_commitments_in,
            final_challenges,
            start_acc,
        );

        assert_eq(hashed_blobs_fields, sponge_blob.squeeze());

        validate_final_blob_batching_challenges(output, final_challenges);

        // Finalize the output (actually done in the root circuit)
        let final_acc = output.finalize();

        assert_eq(final_acc.z, final_challenges.z);
        assert_eq(
            output.gamma_pow_acc,
            final_challenges.gamma.__pow(BLS12_381_Fr::from(BLOBS_PER_BLOCK as Field)),
        );

        let expected_y = BLS12_381_Fr::from_limbs(y_limbs_3_blobs_from_ts);

        let expected_c = BatchingBlobCommitment::from_limbs(
            batched_c_x_limbs_3_blobs_from_ts,
            batched_c_y_limbs_3_blobs_from_ts,
        )
            .to_compressed_fields();

        assert_eq(final_acc.y, expected_y);
        assert_eq(final_acc.c, expected_c);
        assert_eq(final_acc.blob_commitments_hash, blob_commitments_hash_3_blobs_from_ts);
    }

    #[test(should_fail_with = "Found non-zero field after breakpoint")]
    unconstrained fn test_no_extra_blob_fields() {
        let mut blob = [0; FIELDS_PER_BLOB];
        // Fill fields with 50 inputs...
        for i in 0..50 {
            blob[i] = 3;
        }
        // ...but the rollup's sponge is only expecting 45...
        let num_fields = 45;

        // ...so the below should fail as it detects we are adding effects which did not come from the rollup.
        let _ = evaluate_blobs_and_batch(
            blob,
            num_fields,
            [BLSPoint::point_at_infinity()],
            FinalBlobBatchingChallenges::empty(),
            BlobAccumulator::empty(),
        );
    }

    #[test]
    unconstrained fn test_empty_blob() {
        let blob = [0; FIELDS_PER_BLOB];
        // The below should not throw
        let _ = evaluate_blobs_and_batch(
            blob,
            0,
            [BLSPoint::point_at_infinity()],
            FinalBlobBatchingChallenges::empty(),
            BlobAccumulator::empty(),
        );
    }
}

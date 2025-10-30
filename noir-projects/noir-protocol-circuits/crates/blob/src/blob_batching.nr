use crate::{
    abis::{
        BatchingBlobCommitment, BlobAccumulationInputs, BlobAccumulator, BLSPoint,
        FinalBlobBatchingChallenges,
    },
    blob::barycentric_evaluate_blob_at_z,
    utils::{compress_to_blob_commitment, validate_canonical_point_at_infinity},
};
use bigcurve::BigCurve;
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
    // The rationale behind this is that the start accumulator is hinted, and in merge we just assert that left.end.eq(right.start)
    // And on root we check that left.start.eq(empty()).
    // However, currently the equals method of big curve points doesn't check for equality of the limbs on infinity points.
    // This means that infinity points can be swapped with non canonical versions without the eq realizing it.
    // I don't think there is a way to take advantage of that, since we should never have infinity points in c_acc,
    // but as good measure we'll validate that it's canonical here.
    validate_canonical_point_at_infinity(start_accumulator.c_acc);
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
        let commitment_point = kzg_commitments_points[i];
        // We need to validate that the point is on the curve and canonical (0,0 if infinity), since it's hinted in this verification scheme
        commitment_point.validate_on_curve();
        validate_canonical_point_at_infinity(commitment_point);
        let c_i = compress_to_blob_commitment(commitment_point);
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
    use bignum::fields::bls12_381Fq::BLS12_381_Fq;
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
    unconstrained fn test_max_blobs_batched() {
        // Create BLOBS_PER_BLOCK-1 full blobs and 1 blob with 123 fields.
        let num_fields = FIELDS_PER_BLOB * (BLOBS_PER_BLOCK - 1) + 123;
        // Fill BLOBS_PER_BLOCK blobs completely with different values (to avoid a constant polynomial)
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
            0xd98821307463f0f2453a6596b611d7,
            0x3553efff4ebfa752f0c2a7e37ae201,
            0x5656fb0ec77fc885c126e2d7222567,
            0x0ada2f,
        ];
        let kzg_commitment_y_limbs_blob_0_from_ts = [
            0x4b40f6074b53e460406a04e2897cf4,
            0xb6354d81981823c4620865243f3a07,
            0x3fe19618b6a81b4dbe28782c7ff05f,
            0x0e99c2,
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
            0x95ff2f2e3fbbdd8f3c5cbaf7041f86,
            0x73dd9cb0866ddc65ad243d800de218,
            0xeb16d48b698a6f46d9b30ff5aa9235,
            0x0af690,
        ];
        let kzg_commitment_y_limbs_blob_2_from_ts = [
            0x15d6a22755e87c70bb17c376d284a1,
            0x08973528e0edd0d9d9abc33df1409a,
            0x465d9a4c63043f1610de902590fc05,
            0x179a7d,
        ];
        let kzg_commitment_x_limbs_blob_3_from_ts = [
            0x8abcc04672921555d249013c6a2dff,
            0xe6f4bdf1519b96a9587ef925a61c3f,
            0x1eefebbf752d447ca03143ce29c14c,
            0x01f9a4,
        ];
        let kzg_commitment_y_limbs_blob_3_from_ts = [
            0xe815f4764674c8cefb92fc66427c4e,
            0x5bb9509e9456bfa6b96d181e98790f,
            0xa4c15ad388331ecaf1db719518d990,
            0x096fca,
        ];
        let kzg_commitment_x_limbs_blob_4_from_ts = [
            0x2e538340c1895070cd8c48ee520eea,
            0xe676c25dc822620f0d717f5271350c,
            0x7e4fc5215cac39163be65ecb56b08c,
            0x046ebd,
        ];
        let kzg_commitment_y_limbs_blob_4_from_ts = [
            0x6dbae28f6da17be4e2b4ae84b9a004,
            0x4962c2dd58e9b267461571cb9df1d8,
            0x4ac580cc6619ab9c5cacef1d2e45e4,
            0x080795,
        ];
        let kzg_commitment_x_limbs_blob_5_from_ts = [
            0x4180193fcc19faef8b549feed11bd9,
            0xfea2e4d547d062520dc1f07c46ec36,
            0x6759dee549e2cac51898e1015dab52,
            0x02c558,
        ];
        let kzg_commitment_y_limbs_blob_5_from_ts = [
            0x915c85bd0a86e17554a61e2a78ab90,
            0xb8d17f1a895b20bed80d82831829b6,
            0xa2ed663b09d9b137725c89ceb05570,
            0x12faab,
        ];
        let z_6_blobs_from_ts = 0x290028c04e1c668964107b6c7bd0d788e34ba66774e19d535d4e0001ad50425f;
        let gamma_limbs_6_blobs_from_ts =
            [0x9727d3cd1ba9a0c112cf261ab67d8a, 0xf275e92ed252cb59189a91bdb04851, 0x2c0d];
        let y_limbs_6_blobs_from_ts =
            [0x0b6956714bd922f3f75bb37bc1ad7b, 0x3d3ed3ccecbc6dbf093e8e7dabcc5a, 0x1116];
        let batched_c_x_limbs_6_blobs_from_ts = [
            0x5590379c09358bc9d4cfaacce118bf,
            0x576ec13daa7bcd9002dbc0e7a1bb20,
            0x2911a2aad64c7b41120f18efd47dfe,
            0x04ac80,
        ];
        let batched_c_y_limbs_6_blobs_from_ts = [
            0x0cc496dec19c9b69212cb819d6f409,
            0x15243e2ecd073f6075e047365309d8,
            0x65b1a913e7af6c2b9520c957c3a21e,
            0x0f974a,
        ];
        let blob_commitments_hash_6_blobs_from_ts =
            0x00b474d73f8677cb2eb1b2e5278ee12e8611c35bf86326db8b2cd5c6e102e482;

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
            BatchingBlobCommitment::from_limbs(
                kzg_commitment_x_limbs_blob_3_from_ts,
                kzg_commitment_y_limbs_blob_3_from_ts,
            )
                .point,
            BatchingBlobCommitment::from_limbs(
                kzg_commitment_x_limbs_blob_4_from_ts,
                kzg_commitment_y_limbs_blob_4_from_ts,
            )
                .point,
            BatchingBlobCommitment::from_limbs(
                kzg_commitment_x_limbs_blob_5_from_ts,
                kzg_commitment_y_limbs_blob_5_from_ts,
            )
                .point,
        ];

        let final_challenges = FinalBlobBatchingChallenges {
            // - The final z value is injected and checked for correctness in root (see below final_acc)
            z: z_6_blobs_from_ts,
            // - The final gamma value is injected and checked for correctness in root (see below final_acc)
            gamma: BLS12_381_Fr::from_limbs(gamma_limbs_6_blobs_from_ts),
        };
        // Init. the accumulator
        let start_acc = BlobAccumulator::empty();
        // Evaluate all BLOBS_PER_BLOCK blobs and iteratively accumulate the results
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

        let expected_y = BLS12_381_Fr::from_limbs(y_limbs_6_blobs_from_ts);

        let expected_c = BatchingBlobCommitment::from_limbs(
            batched_c_x_limbs_6_blobs_from_ts,
            batched_c_y_limbs_6_blobs_from_ts,
        )
            .to_compressed_fields();

        assert_eq(final_acc.y, expected_y);
        assert_eq(final_acc.c, expected_c);
        assert_eq(final_acc.blob_commitments_hash, blob_commitments_hash_6_blobs_from_ts);
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

    #[test(should_fail_with = "Non canonical x coordinate at infinity")]
    unconstrained fn test_non_canonical_point_at_infinity_fails() {
        let mut blob = [0; FIELDS_PER_BLOB];
        let point = BLSPoint { x: BLS12_381_Fq::one(), y: BLS12_381_Fq::zero(), is_infinity: true };

        let _ = evaluate_blobs_and_batch(
            blob,
            FIELDS_PER_BLOB,
            [point],
            FinalBlobBatchingChallenges::empty(),
            BlobAccumulator::empty(),
        );
    }

    #[test(should_fail)]
    unconstrained fn test_point_not_on_curve_fails() {
        let mut blob = [0; FIELDS_PER_BLOB];
        let point = BLSPoint {
            x: BLS12_381_Fq::from_limbs([0, 0, 0, 42]),
            y: BLS12_381_Fq::from_limbs([0, 0, 0, 27]),
            is_infinity: false,
        };

        let _ = evaluate_blobs_and_batch(
            blob,
            FIELDS_PER_BLOB,
            [point],
            FinalBlobBatchingChallenges::empty(),
            BlobAccumulator::empty(),
        );
    }

}

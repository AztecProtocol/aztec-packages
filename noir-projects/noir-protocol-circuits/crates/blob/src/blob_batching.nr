use crate::{
    abis::{
        BatchingBlobCommitment, BlobAccumulationInputs, BlobAccumulator, BLSPoint,
        FinalBlobBatchingChallenges,
    },
    blob::barycentric_evaluate_blob_at_z,
    compute_factor,
    compute_fracs,
    utils::{compress_to_blob_commitment, validate_canonical_representation_if_infinity},
};
use bigcurve::BigCurve;
use bignum::BLS12_381_Fr;
use types::{
    constants::{DOM_SEP__BLOB_CHALLENGE_Z, FIELDS_PER_BLOB},
    hash::poseidon2_hash_with_separator,
    traits::Empty,
    utils::arrays::subarray,
};

// Note: fracs and factor are computed once in the checkpoint root rollup and shared across all blobs.

// Evaluates a single blob:
// - Evaluates the blob at shared challenge z and returns result y_i
// - Calculates this blob's challenge z_i (= H(H(blob_i), C_i)), where C_i = kzg_commitment, and blob_i = blob_as_fields[i].
fn evaluate_blob_for_batching(
    blob_as_fields: [Field; FIELDS_PER_BLOB],
    kzg_commitment: BatchingBlobCommitment,
    blob_fields_hash: Field,
    fracs: [BLS12_381_Fr; FIELDS_PER_BLOB],
    factor: BLS12_381_Fr,
) -> (Field, BLS12_381_Fr) {
    // Note: this conversion is lossless: the size of a native BN Fr `Field` is 254 bits, whereas
    // the BLS_12_381_Fr scalar field is 255 bits.
    // (AUDITTODO) Potential optimization: can we batch the conversion of the blob fields to BLS12_381_Fr?
    let blob = blob_as_fields.map(|b| BLS12_381_Fr::from(b));

    let y_i = barycentric_evaluate_blob_at_z(blob, fracs, factor);
    let z_i = compute_blob_challenge(blob_fields_hash, kzg_commitment);

    (z_i, y_i)
}

// Computes challenge for a single blob:
// - z_i (= H(H(blob_i), C_i)), where C_i = kzg_commitment, and blob_i = blob_as_fields[i].
fn compute_blob_challenge(
    blob_fields_hash: Field,
    kzg_commitment: BatchingBlobCommitment,
) -> Field {
    let compressed_fields = kzg_commitment.to_compressed_fields();
    let preimage = [blob_fields_hash, compressed_fields[0], compressed_fields[1]];
    let challenge = poseidon2_hash_with_separator(preimage, DOM_SEP__BLOB_CHALLENGE_Z);
    challenge
}

/// Evaluates each blob required for a checkpoint:
/// - Compresses each of the blob's injected commitments.
/// - Evaluates each blob individually to find its challenge `z_i` and evaluation `y_i`.
/// - Updates the batched blob accumulator.
///
/// Note: `fracs` and `factor` are computed once in the checkpoint root rollup from the shared
/// challenge `z` and are reused for all blob evaluations.
pub fn evaluate_blobs_and_batch<let NumBlobs: u32>(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * NumBlobs],
    num_fields: u32,
    blob_fields_hash: Field,
    kzg_commitments_points: [BLSPoint; NumBlobs],
    final_blob_challenges: FinalBlobBatchingChallenges,
    start_accumulator: BlobAccumulator,
    challenge_z: BLS12_381_Fr,
) -> BlobAccumulator {
    // The rationale behind this line is that the start accumulator is hinted, and in merge we just assert that left.end.eq(right.start)
    // And on root we check that left.start.eq(empty()).
    // However, currently the equals method of big curve points doesn't check for equality of the limbs on infinity points.
    // This means that infinity points can be swapped with non canonical versions without the eq realizing it.
    // I don't think there is a way to take advantage of that, since we should never have infinity points in c_acc,
    // but as good measure we'll validate that it's canonical here.
    // Also, the Root Rollup circuit technically validates that the start accumulator of the checkpoint is Empty,
    // and the Empty impl uses the canonical representation of infinity.
    let fracs = compute_fracs(challenge_z);
    let factor = compute_factor(challenge_z);
    validate_canonical_representation_if_infinity(start_accumulator.c_acc);

    let mut end_accumulator = start_accumulator;
    for i in 0..NumBlobs {
        let single_blob_fields = subarray(blobs_as_fields, i * FIELDS_PER_BLOB);
        let commitment_point = kzg_commitments_points[i];
        // We need to validate that the point is on the curve and canonical (0,0 if infinity), since it's hinted in this verification scheme
        commitment_point.validate_on_curve();
        // Strangely, `validate_on_curve` doesn't validate the point at infinity, so we check that here:
        validate_canonical_representation_if_infinity(commitment_point);
        let c_i = compress_to_blob_commitment(commitment_point);

        // Note that with multiple blobs per block, each blob uses the same blob_fields_hash in z_i.
        // This is ok, because each commitment is unique to the blob, and we need `blob_fields_hash` to encompass all
        // fields in the blob, which it does.
        let (z_i, y_i) =
            evaluate_blob_for_batching(single_blob_fields, c_i, blob_fields_hash, fracs, factor);

        // Accumulate ceil(num_fields / FIELDS_PER_BLOB) blobs.
        //
        // Note:
        // - We can't rely on `y_i.is_zero()` to decide whether to accumulate. A blob may legitimately contain only
        //   zeros (e.g. from a contract class log or public log).
        //   - If we skip such an "empty" blob, the hash check on L1 would fail.
        //   - If we remove the zeros entirely, it will be difficult to reconstruct the tx effects correctly.
        // - We can't use `c_i` because it's injected as a hint. Its value should match what's computed from the blobs
        //   submitted to L1, so it cannot be used here to decide whether to accumulate/submit a blob or not.
        // - We can't use `z_i` either, because `z_i` relies on the `blob_fields_hash`, which is the hash of the
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

    end_accumulator
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
    use protocol_test_utils::{pad_end, pad_end_with};
    use types::{constants::FIELDS_PER_BLOB, hash::sha256_to_field, traits::Empty};

    #[test]
    fn test_1_blob_batched() {
        // We evaluate 1 blob of 400 items using the batch methods.
        // This ensures a block with a single blob will work:
        let num_fields = 400;
        let mut blob_fields: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        for i in 0..num_fields {
            blob_fields[i] = 123 + i as Field;
        }

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob_batching.test.ts
        let blob_fields_hash_blob_400_from_ts =
            0x10e7a5250a2eed72979690733b80804798338de751531bc3401be72c94d17fe6;
        let kzg_commitment_x_limbs_blob_400_from_ts = [
            0xcea8dc690c5b8ae96f9754900da08b,
            0xa4c96dfd4e5ca8fb6bfe4b4c5a14c3,
            0x9855cd30030b14f21ede36c07632d0,
            0x13fb86,
        ];
        let kzg_commitment_y_limbs_blob_400_from_ts = [
            0x63a5a3323551d4b4f6f037721df397,
            0x01c207e252b48e344836feca21738d,
            0x3faea573187a84ffda9855c15596b8,
            0x1962ca,
        ];
        let z_blob_400_from_ts = 0x0385a84e8d5e59bde136bb296dbda99180c409974a07b2d7084d9c4e3b06dc69;
        let gamma_limbs_blob_400_from_ts =
            [0xe2d69fdf2deace017adcce741873ca, 0x11e4e4c9035c35acd8ea601d46f020, 0x08e5];
        let y_limbs_blob_400_from_ts =
            [0xf63403f694f4e5f9341d1fc274a09c, 0x5c5064c1c1115988f901a3928433a4, 0x4ce5];

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

        let challenge_z = BLS12_381_Fr::from(final_challenges.z);

        // Evaluation: Can evaluate up to 3 blobs, but only 1 is needed and will be accumulated.
        let res = evaluate_blobs_and_batch::<3>(
            pad_end(blob_fields),
            num_fields,
            blob_fields_hash_blob_400_from_ts,
            pad_end_with([kzg_commitment], BLSPoint::point_at_infinity()),
            final_challenges,
            BlobAccumulator::empty(),
            challenge_z,
        );

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
        let num_blobs = 3;
        // Create 2 full blobs and 1 blob with 123 fields.
        let num_fields = FIELDS_PER_BLOB * 2 + 123;
        // Fill the blobs completely with different values (to avoid a constant polynomial)
        let mut blob_fields = [0; FIELDS_PER_BLOB * 3];
        for i in 0..num_fields {
            blob_fields[i] = 456 + i as Field;
        }

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob_batching.test.ts
        let blob_fields_hash_3_blobs_from_ts =
            0x1c501e5d16d469f6b3e06418af17686f4d34f69fa4ed5d9690850a3e88f30810;
        let kzg_commitment_x_limbs_blob_0_from_ts = [
            0xc1c8bbec58d7e25cc840d31e1a0361,
            0xdfebfabcadc58a67da75e8c3ee4a09,
            0x5504cd781b65efd4f539e321e4d17a,
            0x171570,
        ];
        let kzg_commitment_y_limbs_blob_0_from_ts = [
            0x96af7267d106a96b4353b5ed0bf0a6,
            0xb785a85e0f1404abe16503604906e6,
            0x471e2147e13fe3eaa97ada6f828112,
            0x15e24d,
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
        let z_3_blobs_from_ts = 0x1f4a21e3a1ab23739c164d0df1596c870180aab5f810c548097dd6371ac3186d;
        let gamma_limbs_3_blobs_from_ts =
            [0xf8b8cfdf51c20cc6ffc9820eb0d204, 0x36482d033a8c01a3089bba6714ca12, 0x14e8];
        let y_limbs_3_blobs_from_ts =
            [0x2efdd5c643e35c174ad283728606d0, 0xec1be7b72f4d498565159353969b29, 0x6632];
        let batched_c_x_limbs_3_blobs_from_ts = [
            0x5101f24f9f437af987af28c702c041,
            0x468ab01b44deaac4082cace7b65ced,
            0x78ee78fa48e49ce445e26440d58e49,
            0x0d9f26,
        ];
        let batched_c_y_limbs_3_blobs_from_ts = [
            0x4f9c2645c3b2236aeffb03a639a0ee,
            0x3697b5fc6b7a457acc63250b8a0737,
            0x2b3bdc8e5c90079309b3b3c8370bc7,
            0x16ed67,
        ];
        let blob_commitments_hash_3_blobs_from_ts =
            0x00993920f366febbb5cd05c6436eda28a447447f58a1b7d713c21423790c395b;

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

        let challenge_z = BLS12_381_Fr::from(final_challenges.z);

        // Init. the accumulator
        let start_acc = BlobAccumulator::empty();
        // Evaluate all blobs and iteratively accumulate the results
        let output = evaluate_blobs_and_batch(
            blob_fields,
            num_fields,
            blob_fields_hash_3_blobs_from_ts,
            kzg_commitments_in,
            final_challenges,
            start_acc,
            challenge_z,
        );

        validate_final_blob_batching_challenges(output, final_challenges);

        // Finalize the output (actually done in the root circuit)
        let final_acc = output.finalize();

        assert_eq(final_acc.z, final_challenges.z);
        assert_eq(
            output.gamma_pow_acc,
            final_challenges.gamma.__pow(BLS12_381_Fr::from(num_blobs as Field)),
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

    #[test]
    fn test_empty_blob() {
        let blob = [0; FIELDS_PER_BLOB];
        let final_challenges = FinalBlobBatchingChallenges::empty();

        let challenge_z = BLS12_381_Fr::from(final_challenges.z);

        // The below should not throw
        let _ = evaluate_blobs_and_batch(
            blob,
            0, // num_fields
            123, // Arbitrary blob fields hash.
            [BLSPoint::point_at_infinity()],
            final_challenges,
            BlobAccumulator::empty(),
            challenge_z,
        );
    }

    #[test(should_fail_with = "Non canonical x coordinate at infinity")]
    fn test_non_canonical_point_at_infinity_fails() {
        let blob = [0; FIELDS_PER_BLOB];
        let point = BLSPoint { x: BLS12_381_Fq::one(), y: BLS12_381_Fq::zero(), is_infinity: true };
        let final_challenges = FinalBlobBatchingChallenges::empty();

        let challenge_z = BLS12_381_Fr::from(final_challenges.z);

        let _ = evaluate_blobs_and_batch(
            blob,
            FIELDS_PER_BLOB,
            123, // Arbitrary blob fields hash.
            [point],
            final_challenges,
            BlobAccumulator::empty(),
            challenge_z,
        );
    }

    #[test(should_fail)]
    fn test_point_not_on_curve_fails() {
        let blob = [0; FIELDS_PER_BLOB];
        let point = BLSPoint {
            x: BLS12_381_Fq::from_limbs([0, 0, 0, 42]),
            y: BLS12_381_Fq::from_limbs([0, 0, 0, 27]),
            is_infinity: false,
        };
        let final_challenges = FinalBlobBatchingChallenges::empty();

        let challenge_z = BLS12_381_Fr::from(final_challenges.z);

        let _ = evaluate_blobs_and_batch(
            blob,
            FIELDS_PER_BLOB,
            123, // Arbitrary blob fields hash.
            [point],
            final_challenges,
            BlobAccumulator::empty(),
            challenge_z,
        );
    }

}

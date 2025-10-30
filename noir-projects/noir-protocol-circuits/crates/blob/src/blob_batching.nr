use crate::{
    blob::barycentric_evaluate_blob_at_z,
    blob_batching_public_inputs::{
        BatchingBlobCommitment, BlobAccumulationInputs, BlobAccumulatorPublicInputs, BLSPoint,
        compress_to_blob_commitment, FinalBlobBatchingChallenges,
    },
};
use bigint::{BigNum, BLS12_381_Fr as F};
use types::{
    abis::sponge_blob::SpongeBlob,
    constants::{BLOBS_PER_BLOCK, FIELDS_PER_BLOB},
    hash::poseidon2_hash_subarray,
    traits::Empty,
    utils::arrays::array_splice,
};

// Evaluates a single blob:
// - Evaluates the blob at shared challenge z and returns result y_i
// - Calculates this blob's challenge z_i (= H(H(blob_i), C_i)), where C_i = kzg_commitment, and blob_i = blob_as_fields[i].
fn evaluate_blob_for_batching(
    blob_as_fields: [Field; FIELDS_PER_BLOB],
    kzg_commitment: BatchingBlobCommitment,
    hashed_blobs_fields: Field,
    challenge_z: Field,
) -> (Field, F) {
    let challenge_z_as_bignum = F::from(challenge_z);
    let blob = blob_as_fields.map(|b| F::from(b));

    let y_i: F = barycentric_evaluate_blob_at_z(challenge_z_as_bignum, blob);
    let z_i: Field =
        compute_blob_challenge(hashed_blobs_fields, kzg_commitment.to_compressed_fields());

    (z_i, y_i)
}

// Computes challenge for a single blob:
// - z_i (= H(H(blob_i), C_i)), where C_i = kzg_commitment, and blob_i = blob_as_fields[i].
fn compute_blob_challenge(hashed_blobs_fields: Field, kzg_commitment: [Field; 2]) -> Field {
    let preimage = [hashed_blobs_fields, kzg_commitment[0], kzg_commitment[1]];
    let challenge = poseidon::poseidon2::Poseidon2::hash(preimage, 3);
    challenge
}

// Evaluates each blob required for a block:
// - Hashes all fields in the block's blobs (to use for the challenges z_i)
// - Compresses each of the blob's injected commitments (")
// - Evaluates each blob individually to find its challenge z_i & evaluation y_i
// - Updates the batched blob accumulator
pub fn evaluate_blobs_and_batch(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    kzg_commitments_points: [BLSPoint; BLOBS_PER_BLOCK],
    mut sponge_blob: SpongeBlob,
    final_blob_challenges: FinalBlobBatchingChallenges,
    start_accumulator: BlobAccumulatorPublicInputs,
) -> BlobAccumulatorPublicInputs {
    // See components.nr out_sponge definition as to why we copy here:
    let mut end_accumulator = start_accumulator;
    // Note that with multiple blobs per block, each blob uses the same hashed_blobs_fields in:
    // z_i = H(hashed_blobs_fields, kzg_commitment[0], kzg_commitment[1])
    // This is ok, because each commitment is unique to the blob, and we need hashed_blobs_fields to encompass
    // all fields in the blob, which it does.
    let hashed_blobs_fields = check_block_blob_sponge(blobs_as_fields, sponge_blob);
    for i in 0..BLOBS_PER_BLOCK {
        let single_blob_fields = array_splice(blobs_as_fields, i * FIELDS_PER_BLOB);
        let c_i = compress_to_blob_commitment(kzg_commitments_points[i]);
        let (z_i, y_i) = evaluate_blob_for_batching(
            single_blob_fields,
            c_i,
            hashed_blobs_fields,
            final_blob_challenges.z,
        );
        // TODO(#14646): If the evaluation being zero is sufficient to say the blob i is empty, remove the range check.
        // The range check exists because we cannot use c_i (it's injected and L1 relies on this circuit to check whether the blob is
        // empty for c_i = O) or z_i (z_i relies on the hashed_blobs_fields, which is the hash of the items in ALL block blobs, not just i).
        let is_empty_blob = sponge_blob.fields <= i * FIELDS_PER_BLOB;
        if (!y_i.is_zero()) & (!is_empty_blob) {
            // Only accumulate if the blob is non empty
            if (end_accumulator.is_empty()) & (i == 0) {
                // Init only if accumulator is empty:
                //  - This will be checked in root, where the left input's start acc will be constrained to be zero
                //  - No other accs can be zero since each block_merge checks left's end acc == right's start acc
                // This can only happen at blob i = 0 for the first block of the epoch. Note: i == 0 was only added above in the hope
                // that noir would be able to optimize out init gates for i > 0!
                end_accumulator = BlobAccumulatorPublicInputs::init(
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

// Validates this block's injected blob fields against the validated sponge propagated from the previous circuits:
// - Checks that we haven't accumulated too many fields over the rollup
// - Checks that we have absorbed the exact number of fields we claim to have accumulated
// - Checks that the injected fields match the tx effects absorbed over the rollup
// - Checks that any fields above expected_fields are empty (inside poseidon2_hash_subarray())
fn check_block_blob_sponge(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    mut sponge_blob: SpongeBlob,
) -> Field {
    // Check that we haven't overfilled the blobs
    assert(
        sponge_blob.expected_fields <= FIELDS_PER_BLOB * BLOBS_PER_BLOCK,
        "Attempted to overfill blobs",
    );
    // Check that the blob is full
    assert(
        sponge_blob.expected_fields == sponge_blob.fields,
        "Incorrect number of tx effects added to blob",
    );
    let sponge_hash = sponge_blob.squeeze();
    let hash = poseidon2_hash_subarray(blobs_as_fields, sponge_blob.fields);
    assert(hash == sponge_hash, "Mismatched hashed tx effects");

    sponge_hash
}

mod tests {
    use crate::blob_batching_public_inputs::{
        BatchingBlobCommitment, BlobAccumulatorPublicInputs, compress_to_blob_commitment,
        FinalBlobBatchingChallenges,
    };
    use super::{check_block_blob_sponge, evaluate_blobs_and_batch};
    use bigcurve::{BigCurve, curves::bls12_381::BLS12_381 as BLSPoint};
    use bigint::{BigNum, BLS12_381_Fr as F};
    use types::{
        abis::sponge_blob::SpongeBlob,
        constants::{BLOBS_PER_BLOCK, FIELDS_PER_BLOB},
        hash::sha256_to_field,
        tests::utils::pad_end,
        traits::Empty,
    };

    // All hardcoded values in this test are taken from yarn-project/foundation/src/blob/blob_batching.test.ts -> 'should construct and verify a batched blob of 400 items'
    #[test]
    unconstrained fn test_400_batched() {
        // We evaluate 1 blob of 400 items using the batch methods.
        // This ensures a block with a single blob will work:
        let num_fields = 400;
        let mut blob: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        // Fill blobs with different values (to avoid a constant polynomial). This must match the values in blob_batching.test.ts
        for i in 1..num_fields {
            blob[i] = 123 + i as Field;
        }

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob_batching.test.ts
        let tx_marker_blob_400_from_ts =
            0x000000000000000000000000000000000074785f737461727400019000010000;
        blob[0] = tx_marker_blob_400_from_ts;

        let kzg_commitment_x_limbs_blob_400_from_ts = [
            0x02c8f0f9f4b98a0cf58b33aeeb7738,
            0x6c112370be8600ad4264e2b06c98f8,
            0x6da6d505c70f652cbde547b77c315c,
            0x0b3fe5,
        ];
        let kzg_commitment_y_limbs_blob_400_from_ts = [
            0x7fda90b2323383f94c86af4f9a5bce,
            0x9f17a63a14971e230943e3381eb931,
            0xa1ccb20d8f7a60d001e50593836395,
            0x1241d1,
        ];
        let z_blob_400_from_ts = 0x0d760a84f939ae1235145fcd7630b50c76452658b1db7572a9ba75328e38f36c;
        let gamma_limbs_blob_400_from_ts =
            [0x1afcc9fe33376cb022b7bb53b2ecd2, 0x7911504ab249599d5f3b2cc544e327, 0x1b19];
        let y_limbs_blob_400_from_ts =
            [0xbd0e5e50b95cb84d49b49acb40c185, 0x96c04c7b39323e7c9b06e01ae14fa6, 0x68e3];

        let kzg_commitment = BatchingBlobCommitment::from_limbs(
            kzg_commitment_x_limbs_blob_400_from_ts,
            kzg_commitment_y_limbs_blob_400_from_ts,
        )
            .point;

        let mut sponge_blob = SpongeBlob::new(num_fields);
        sponge_blob.absorb(blob, num_fields);

        let kzg_commitments =
            [kzg_commitment, BLSPoint::point_at_infinity(), BLSPoint::point_at_infinity()];

        let final_challenges = FinalBlobBatchingChallenges {
            // = z_0
            z: z_blob_400_from_ts,
            // = H(y_0, z_0)
            gamma: F::from_limbs(gamma_limbs_blob_400_from_ts),
        };

        // Evaluation
        let res = evaluate_blobs_and_batch(
            pad_end(blob, 0),
            kzg_commitments,
            sponge_blob,
            final_challenges,
            BlobAccumulatorPublicInputs::empty(),
        );
        let final_acc = res.finalize_and_validate(final_challenges);

        assert_eq(final_acc.z, final_challenges.z);
        // Since i = 1, gamma_pow = gamma^1 = gamma:
        assert_eq(res.gamma_pow_acc, final_challenges.gamma);

        let expected_y: F = F::from_limbs(y_limbs_blob_400_from_ts);
        assert_eq(final_acc.y, expected_y);

        let blob_commitment = compress_to_blob_commitment(kzg_commitment);

        // Since i = 1, blob_commitments_hash is just the sha256 hash of the single (compressed) commitment
        let expected_blob_commitments_hash = sha256_to_field(blob_commitment.compressed);
        assert_eq(final_acc.blob_commitments_hash, expected_blob_commitments_hash);

        // Since i = 1, C = gamma^0 * C_0 = C_0
        assert_eq(final_acc.c, blob_commitment.to_compressed_fields());
    }

    // All hardcoded values in this test are taken from yarn-project/foundation/src/blob/blob_batching.test.ts -> 'should construct and verify a batch of 3 full blobs'
    #[test]
    unconstrained fn test_3_blobs_batched() {
        // Create 2 full blobs and 1 blob with 123 fields.
        let num_fields = FIELDS_PER_BLOB * 2 + 123;
        let mut blob_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK] =
            [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK];
        let mut blob_fields = [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK];
        // Fill blobs with different values (to avoid a constant polynomial). This must match the values in blob_batching.test.ts
        for i in 1..num_fields {
            blob_fields[i] = 456 + i as Field;
        }

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob_batching.test.ts
        let tx_marker_3_blobs_from_ts =
            0x000000000000000000000000000000000074785f737461727400207b00010000;
        blob_fields[0] = tx_marker_3_blobs_from_ts;
        let kzg_commitment_x_limbs_blob_0_from_ts = [
            0x6af636f420e4f7efe323c240d36ada,
            0x2b03bbc502baa6584c578435bb416c,
            0x6bbcbfc674534a8749a78da030f174,
            0x13689f,
        ];
        let kzg_commitment_y_limbs_blob_0_from_ts = [
            0x35c16ae03958ccb00658f2140c9152,
            0x21f6914defa64348be8ec70dcafc3c,
            0x6de3430c5e1280f5fcc76ac44787df,
            0x0233e4,
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
        let z_3_blobs_from_ts = 0x04d90375c388a90065878ce2aa4003d0b869416ad19e281a1c8ee59fc6516bef;
        let gamma_limbs_3_blobs_from_ts =
            [0x24c9e1dbc8270f78891d70a8a71202, 0x157bbc960565c6fd55b3fa028b0772, 0x0942];
        let y_limbs_3_blobs_from_ts =
            [0x78b28ffe4d2a7faf4aa59355e916bf, 0xc8848eb4e434c9377105a725272f3e, 0x2b7a];
        let batched_c_x_limbs_3_blobs_from_ts = [
            0x153285774a8403f59eeab2ac5faa39,
            0x772c7892616666b464136bccdd0139,
            0xd26eb970d533fc352e37dc3d62d953,
            0x02a88c,
        ];
        let batched_c_y_limbs_3_blobs_from_ts = [
            0xe60fea69963e13083153cd23a776e1,
            0xd1d52166c5329d5d51b91720884c7e,
            0x75b15a752f07c05efcdf521fafdd4a,
            0x11a2ba,
        ];
        let blob_commitments_hash_3_blobs_from_ts =
            0x00d1fb172bdfa02958149277fa1d598376ec22c1ad594820aaba65a21710e541;

        // Absorb the values into a sponge
        let mut sponge_blob = SpongeBlob::new(num_fields);
        sponge_blob.absorb(blob_fields, num_fields);

        // Init. injected values:
        // - Commitments are injected and checked for correctness on L1 via acc.v
        let kzg_commitments = [
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
            gamma: F::from_limbs(gamma_limbs_3_blobs_from_ts),
        };

        // Init. the accumulator
        let start_acc = BlobAccumulatorPublicInputs::empty();
        // Evaluate all three blobs and iteratively accumulate the results
        let output = evaluate_blobs_and_batch(
            blob_fields,
            kzg_commitments,
            sponge_blob,
            final_challenges,
            start_acc,
        );
        // Finalize the output (actually done in the root circuit)
        let final_acc = output.finalize_and_validate(final_challenges);

        assert_eq(final_acc.z, final_challenges.z);
        assert_eq(
            output.gamma_pow_acc,
            final_challenges.gamma.__pow(F::from(BLOBS_PER_BLOCK as Field)),
        );

        let expected_y = F::from_limbs(y_limbs_3_blobs_from_ts);

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
        let mut blob: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        // Fill fields with 50 inputs...
        for i in 0..50 {
            blob[i] = 3;
        }
        // ...but the rollup's sponge is only expecting 45...
        let mut sponge_blob = SpongeBlob::new(45);
        sponge_blob.absorb(blob, 45);

        // ...so the below should fail as it detects we are adding effects which did not come from the rollup.
        let padded_blob_fields = pad_end(blob, 0);
        let _ = super::check_block_blob_sponge(padded_blob_fields, sponge_blob);
    }

    #[test(should_fail_with = "Incorrect number of tx effects added to blob")]
    unconstrained fn test_absorbed_too_few_blob_fields() {
        let mut blob: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        // Fill fields with 50 inputs...
        for i in 0..50 {
            blob[i] = 3;
        }
        // ...but the rollup's sponge is expecting 100...
        let mut sponge_blob = SpongeBlob::new(100);
        sponge_blob.absorb(blob, 50);

        // ...so the below should fail as it detects we have not added all the tx effects.
        let padded_blob_fields = pad_end(blob, 0);
        let _ = check_block_blob_sponge(padded_blob_fields, sponge_blob);
    }

    #[test]
    unconstrained fn test_empty_blob() {
        let mut blob: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK] =
            [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK];
        let mut sponge_blob = SpongeBlob::new(0);
        // The below should not throw
        let _ = check_block_blob_sponge(blob, sponge_blob);
    }
}

use crate::{
    abis::{BatchingBlobCommitment, BlobAccumulator, BLSPoint},
    blob::barycentric_evaluate_blob_at_z,
    compute_factor,
    compute_fracs,
    utils::{compress_to_blob_commitment, validate_canonical_representation_if_infinity},
};
use bigcurve::BigCurve;
use bignum::{BigNum, BLS12_381_Fr};
use types::{
    constants::{DOM_SEP__BLOB_CHALLENGE_Z, DOM_SEP__BLOB_Z_ACC, FIELDS_PER_BLOB},
    hash::poseidon2_hash_with_separator,
    utils::arrays::subarray,
};

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

/// Evaluates each blob required for a checkpoint and accumulates the checkpoint's opening claim:
/// - Compresses each of the blob's injected commitments and computes each blob's challenge `z_i`.
/// - Derives this checkpoint's challenge z = H(...H(z_0, z_1)..., z_n), which depends only on this checkpoint's blobs.
/// - Evaluates each blob at z to find `y_i`.
/// - Accumulates the opening claim, using the hinted `kzg_proof` (the KZG proof of the checkpoint's combined blob
///   polynomial at z), into the batched blob accumulator.
pub fn evaluate_blobs_and_batch<let NumBlobs: u32>(
    blobs_as_fields: [Field; FIELDS_PER_BLOB * NumBlobs],
    num_fields: u32,
    blob_fields_hash: Field,
    kzg_commitments_points: [BLSPoint; NumBlobs],
    kzg_proof: BLSPoint,
    start_accumulator: BlobAccumulator,
) -> BlobAccumulator {
    // The start accumulator is hinted, and in merge we just assert that left.end.eq(right.start), and on root we check
    // that left.start.eq(empty()). The equals method of big curve points doesn't check for equality of the limbs on
    // infinity points, so validate that they are canonical here.
    validate_canonical_representation_if_infinity(start_accumulator.d_acc);
    validate_canonical_representation_if_infinity(start_accumulator.e_acc);

    // Hinted, like the commitments below. G1 membership is not checked: the pairing check on L1 only accepts D and E
    // in G1, and the G1 components of the hinted points satisfy the same equation as the points themselves.
    kzg_proof.validate_on_curve();
    let kzg_proof = compress_to_blob_commitment(kzg_proof);

    // The points are hinted, so validate that they are on the curve. `compress_to_blob_commitment` validates the
    // encoding: canonical x, the sign of y, and (0,0) for infinity. G1 membership is not checked here: the
    // compressed bytes identify the point up to sign, L1 binds them to a published commitment via
    // `blob_commitments_hash`, and both signs of a G1 point are in G1.
    let commitments = kzg_commitments_points.map(|point: BLSPoint| {
        point.validate_on_curve();
        compress_to_blob_commitment(point)
    });

    let mut num_blobs = 0;
    let mut z = 0;
    for i in 0..NumBlobs {
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
        if i * FIELDS_PER_BLOB < num_fields {
            // Note that with multiple blobs per block, each blob uses the same blob_fields_hash in z_i.
            // This is ok, because each commitment is unique to the blob, and we need `blob_fields_hash` to encompass
            // all fields in the blob, which it does.
            let z_i = compute_blob_challenge(blob_fields_hash, commitments[i]);
            z = if i == 0 {
                z_i
            } else {
                poseidon2_hash_with_separator([z, z_i], DOM_SEP__BLOB_Z_ACC)
            };
            num_blobs += 1;
        }
    }

    let challenge_z = BLS12_381_Fr::from(z);
    let fracs = compute_fracs(challenge_z);
    let factor = compute_factor(challenge_z);
    let mut ys: [BLS12_381_Fr; NumBlobs] = [BLS12_381_Fr::zero(); NumBlobs];
    for i in 0..NumBlobs {
        // Note: this conversion is lossless: the size of a native BN Fr `Field` is 254 bits, whereas
        // the BLS_12_381_Fr scalar field is 255 bits.
        // (AUDITTODO) Potential optimization: can we batch the conversion of the blob fields to BLS12_381_Fr?
        let blob = subarray::<_, _, FIELDS_PER_BLOB>(blobs_as_fields, i * FIELDS_PER_BLOB).map(
            |b| BLS12_381_Fr::from(b),
        );
        ys[i] = barycentric_evaluate_blob_at_z(blob, fracs, factor);
    }

    start_accumulator.accumulate_checkpoint(commitments, ys, num_blobs, z, kzg_proof)
}

mod tests {
    use crate::{
        abis::{BatchingBlobCommitment, BlobAccumulator},
        utils::compress_to_blob_commitment,
    };
    use super::evaluate_blobs_and_batch;
    use bigcurve::{BigCurve, curves::bls12_381::BLS12_381 as BLSPoint};
    use bignum::{BigNum, fields::bls12_381Fq::BLS12_381_Fq};
    use protocol_test_utils::{pad_end, pad_end_with};
    use types::{
        constants::FIELDS_PER_BLOB, hash::sha256_to_field, traits::Empty, utils::arrays::subarray,
    };

    // The KZG proofs and the expected D and E below come from crates/blob/scripts/kzg_batch_fixtures.py, a model of
    // the accumulation that is independent of these circuits. Its `verify` mode checks e(D, [1]) == e(E, [s]) with
    // c-kzg's verify_kzg_proof(D, 0, 0, E): the pairing holds for the honest cases and fails for WRONG_PROOF_* and
    // MISMATCHED_BLOB_*. test/rollup/libraries/bloblib/batchedBlobOpening.t.sol in l1-contracts repeats that check
    // with the point evaluation precompile.

    fn point(x_limbs: [u128; 4], y_limbs: [u128; 4]) -> BLSPoint {
        BatchingBlobCommitment::from_limbs(x_limbs, y_limbs).point
    }

    // A single blob of 400 fields. Its commitment is generated from labs/yarn-project/blob-lib/src/blob_batching.test.ts.
    fn single_blob_fields() -> [Field; FIELDS_PER_BLOB] {
        let mut blob_fields: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        for i in 0..400 {
            blob_fields[i] = 123 + i as Field;
        }
        blob_fields
    }

    global SINGLE_BLOB_FIELDS_HASH: Field =
        0x10e7a5250a2eed72979690733b80804798338de751531bc3401be72c94d17fe6;

    fn single_blob_commitment() -> BLSPoint {
        point(
            [
                0xcea8dc690c5b8ae96f9754900da08b,
                0xa4c96dfd4e5ca8fb6bfe4b4c5a14c3,
                0x9855cd30030b14f21ede36c07632d0,
                0x13fb86,
            ],
            [
                0x63a5a3323551d4b4f6f037721df397,
                0x01c207e252b48e344836feca21738d,
                0x3faea573187a84ffda9855c15596b8,
                0x1962ca,
            ],
        )
    }

    // Three blobs: 2 full blobs and 1 blob with 123 fields. Commitments generated from
    // labs/yarn-project/blob-lib/src/blob_batching.test.ts.
    fn three_blob_fields() -> [Field; FIELDS_PER_BLOB * 3] {
        let mut blob_fields = [0; FIELDS_PER_BLOB * 3];
        for i in 0..FIELDS_PER_BLOB * 2 + 123 {
            blob_fields[i] = 456 + i as Field;
        }
        blob_fields
    }

    fn three_blob_commitments() -> [BLSPoint; 3] {
        [
            point(
                [
                    0xc1c8bbec58d7e25cc840d31e1a0361,
                    0xdfebfabcadc58a67da75e8c3ee4a09,
                    0x5504cd781b65efd4f539e321e4d17a,
                    0x171570,
                ],
                [
                    0x96af7267d106a96b4353b5ed0bf0a6,
                    0xb785a85e0f1404abe16503604906e6,
                    0x471e2147e13fe3eaa97ada6f828112,
                    0x15e24d,
                ],
            ),
            point(
                [
                    0xab3ed5948aa3d00fe77b1b2876ecd7,
                    0x9d649e59ee9920f46f5f586bc9f6cb,
                    0x001f300677e564710b67c3ef2b1f46,
                    0x0ac039,
                ],
                [
                    0xaa5703192a3733107a7f7ba1fa98ce,
                    0xc67513549bde2e39d6b6607670cd6b,
                    0x0727a2b1e640aec8dbc7709a0c38be,
                    0x13ed3a,
                ],
            ),
            point(
                [
                    0x2d936449435dd85db10daa4a93572a,
                    0xba75b7a0c3065ee47dd17fa801cbcb,
                    0x308ba7a7145cd3d90a7801a23f0f6b,
                    0x0d4847,
                ],
                [
                    0x5a51aa53fad565ecb91d04288a3a1b,
                    0xbd1bfcd6b075c4749ddf4251b4028c,
                    0x59dcc1d2a509604b557950b349a9f5,
                    0x0c6b4d,
                ],
            ),
        ]
    }

    // Arbitrary blob fields hashes for the two checkpoints of `test_two_checkpoints_batched`.
    global CHECKPOINT_0_BLOB_FIELDS_HASH: Field = 0x1111;
    global CHECKPOINT_1_BLOB_FIELDS_HASH: Field = 0x2222;

    fn single_blob_kzg_proof() -> BLSPoint {
        point(
            [
                0xed3e3200d6fcb7fdeb0fa9ed494ce7,
                0xf5d5f4e4350903f0d352b2e24808f8,
                0x90458f1a51a231ce545e3081f6fc84,
                0x17bd67,
            ],
            [
                0x1d4dcf4089b0274dd0abc1da309bd3,
                0xf4f9780596dd409844314db709a000,
                0x3d1cdaae876c96c88946a06f829726,
                0x0718d6,
            ],
        )
    }
    fn checkpoint_0_kzg_proof() -> BLSPoint {
        point(
            [
                0x460d3b3aac754d09eadb074c7f8eda,
                0x164a331d7c3d551697ab81ceedeee7,
                0x5db35146edf1b273cdddad179900be,
                0x05a430,
            ],
            [
                0x32395cfb61cb05205fd195b529abbb,
                0x37bf5099722e9ec336582b64513511,
                0x52431b13c05aa25cc36cb6c8b1cec9,
                0x15bf81,
            ],
        )
    }
    fn checkpoint_1_kzg_proof() -> BLSPoint {
        point(
            [
                0x546e11f9316dbf7530896ac8a79489,
                0x17e6bc7f6475fa359b5ff8a76899ec,
                0x496d012639d2af9736d771e8126325,
                0x17645c,
            ],
            [
                0x879026dcb56b47f278cc558f294559,
                0x286f19efa7c7ed3d2dfce927ee6127,
                0x661c609b07d5dc75590918c9cebf0e,
                0x1412f7,
            ],
        )
    }
    global SINGLE_BLOB_D: [Field; 2] = [
        0xa696d6e3d847e5858f8510feab39f5f6f1aa69b4e540a00ae63b9369b4b4fe,
        0x704b00b7cec53802811ef93f83fd3ca9ad,
    ];
    global SINGLE_BLOB_E: [Field; 2] = [
        0x861889356b89178b220ffffb6f66328bb58a42d9256a07008bf308b896c1ca,
        0xcc3a8d150c1e081c52ee92ab9d9329a71a,
    ];
    global TWO_CHECKPOINTS_D: [Field; 2] = [
        0x8379778e41802374175a2df22b8e4af30cb7dbb5b59dd696fdb9bb71236f9c,
        0x2d4135aa4a844166d4f02630f8b2c7eac6,
    ];
    global TWO_CHECKPOINTS_E: [Field; 2] = [
        0x960e2e961dd06398352fdf430f32b19577de6461968e7e7db20bcc525ac832,
        0xfb8f1b602235312d64d6befe8472551713,
    ];

    // D and E for the single blob accumulated with the negation of its KZG proof.
    global WRONG_PROOF_D: [Field; 2] = [
        0x9492203acd8af6365c5eced958d2dfcd177114610ae2cfbbed4b8bf66a2a10,
        0x0ec2be37ea4e3f002628a724a24d44f651,
    ];
    global WRONG_PROOF_E: [Field; 2] = [
        0xa068a6474cce2832371fdef5a43dc46d909d4ae1356da0ba7bf605342d2f08,
        0x4ba86c6c075f7494a9fa83e0ce31fa061c,
    ];

    // The commitment and KZG proof of a blob that differs from `single_blob_fields` in its last used field, and the D
    // and E from accumulating `single_blob_fields` against them.
    fn mismatched_blob_commitment() -> BLSPoint {
        point(
            [
                0xb08aefbf79df0f7a8289c24586f772,
                0xa8fa18678da893c53c188ee8b4e25e,
                0x5ccc20935a3f1bb45a3889c9d266bd,
                0x17a473,
            ],
            [
                0xb58592a27a0b01f08e9ede5678c9f2,
                0xbbc5aa116d67671d1e578e1613e1b7,
                0xfb5d8a1bc25fa3017ead4220bece70,
                0x16022d,
            ],
        )
    }

    fn mismatched_blob_kzg_proof() -> BLSPoint {
        point(
            [
                0xef44997df5d590906ba1605f446249,
                0x560912d7194d6bc7228a7a6a2539e2,
                0xb6aae429fcb775367bbfe5d95448f1,
                0x1286bc,
            ],
            [
                0x263f98133c6fe7e4d5e11124266403,
                0x8e8dca7327f68092b5795708f71d6d,
                0x34e891d0dc1c9513f82eeeb937f0cb,
                0x0f24b0,
            ],
        )
    }

    global MISMATCHED_BLOB_D: [Field; 2] = [
        0x81ecdc749aa9888095b572b3b48ef276939acf70e8064c8b94732a44ca2562,
        0x6eba0f4feb74c60fed1075517a0fb189c5,
    ];
    global MISMATCHED_BLOB_E: [Field; 2] = [
        0x82405559553e0eb4d5138df9c0535aad9db9ea7f6382aa15c919939a3903e8,
        0x30de46a5a38a40ac010014ebd8b687c72a,
    ];

    #[test]
    fn test_1_blob_batched() {
        // Can evaluate up to 3 blobs, but only 1 is needed and will be accumulated.
        let res = evaluate_blobs_and_batch::<3>(
            pad_end(single_blob_fields()),
            400,
            SINGLE_BLOB_FIELDS_HASH,
            pad_end_with([single_blob_commitment()], BLSPoint::point_at_infinity()),
            single_blob_kzg_proof(),
            BlobAccumulator::empty(),
        );
        let final_acc = res.finalize();

        // Since there is one blob, blob_commitments_hash is the sha256 hash of the checkpoint start flag (0x01: this
        // blob starts a checkpoint) and the single (compressed) commitment.
        let blob_commitment = compress_to_blob_commitment(single_blob_commitment());
        assert_eq(
            final_acc.blob_commitments_hash,
            sha256_to_field([1].concat(blob_commitment.compressed)),
        );
        assert_eq(final_acc.d, SINGLE_BLOB_D);
        assert_eq(final_acc.e, SINGLE_BLOB_E);
    }

    fn accumulate_two_checkpoints() -> BlobAccumulator {
        let fields = three_blob_fields();
        let commitments = three_blob_commitments();
        // Checkpoint 0: blobs 0 and 1, both full.
        let acc = evaluate_blobs_and_batch::<2>(
            subarray(fields, 0),
            FIELDS_PER_BLOB * 2,
            CHECKPOINT_0_BLOB_FIELDS_HASH,
            [commitments[0], commitments[1]],
            checkpoint_0_kzg_proof(),
            BlobAccumulator::empty(),
        );
        // Checkpoint 1: blob 2, with 123 fields. Opened at a different z to checkpoint 0.
        evaluate_blobs_and_batch::<1>(
            subarray(fields, FIELDS_PER_BLOB * 2),
            123,
            CHECKPOINT_1_BLOB_FIELDS_HASH,
            [commitments[2]],
            checkpoint_1_kzg_proof(),
            acc,
        )
    }

    // A checkpoint with blobs [C_0, C_1], followed by a checkpoint with [C_2], each opened at its own z.
    #[test]
    fn test_two_checkpoints_batched() {
        let final_acc = accumulate_two_checkpoints().finalize();
        assert_eq(final_acc.d, TWO_CHECKPOINTS_D);
        assert_eq(final_acc.e, TWO_CHECKPOINTS_E);

        // L1 must not accept this epoch's proof for proposals that split the same blobs as [C_0] then [C_1, C_2]:
        // test_ShiftedSplitDoesNotMatchTheCircuits in l1-contracts computes both splits on L1 and checks them
        // against this value, which is generated from labs/yarn-project/blob-lib/src/blob_batching.test.ts.
        assert_eq(
            final_acc.blob_commitments_hash,
            0x00c2e3fd7e66a854ce9341649163496ca99c94794099e4bfe1bf084374f34f9a,
        );
    }

    // The circuit cannot reject a wrong KZG proof itself: it outputs a D and E that fail the pairing check on L1.
    #[test]
    fn test_wrong_kzg_proof_gives_opening_that_fails_pairing() {
        let res = evaluate_blobs_and_batch::<1>(
            single_blob_fields(),
            400,
            SINGLE_BLOB_FIELDS_HASH,
            [single_blob_commitment()],
            -single_blob_kzg_proof(),
            BlobAccumulator::empty(),
        );
        let final_acc = res.finalize();
        assert_eq(final_acc.d, WRONG_PROOF_D);
        assert_eq(final_acc.e, WRONG_PROOF_E);
    }

    // The data availability guarantee: if the blob published to L1 differs from the blob fields the circuit proves,
    // then even with an honest KZG proof for the published blob, D and E fail the pairing check on L1.
    #[test]
    fn test_blob_data_mismatching_commitment_gives_opening_that_fails_pairing() {
        let res = evaluate_blobs_and_batch::<1>(
            single_blob_fields(),
            400,
            SINGLE_BLOB_FIELDS_HASH,
            [mismatched_blob_commitment()],
            mismatched_blob_kzg_proof(),
            BlobAccumulator::empty(),
        );
        let final_acc = res.finalize();
        assert_eq(final_acc.d, MISMATCHED_BLOB_D);
        assert_eq(final_acc.e, MISMATCHED_BLOB_E);
    }

    #[test]
    fn test_empty_blob() {
        // The below should not throw
        let _ = evaluate_blobs_and_batch(
            [0; FIELDS_PER_BLOB],
            0, // num_fields
            123, // Arbitrary blob fields hash.
            [BLSPoint::point_at_infinity()],
            BLSPoint::point_at_infinity(),
            BlobAccumulator::empty(),
        );
    }

    #[test(should_fail_with = "Non canonical x coordinate at infinity")]
    fn test_non_canonical_point_at_infinity_fails() {
        let point = BLSPoint { x: BLS12_381_Fq::one(), y: BLS12_381_Fq::zero(), is_infinity: true };
        let _ = evaluate_blobs_and_batch(
            [0; FIELDS_PER_BLOB],
            FIELDS_PER_BLOB,
            123, // Arbitrary blob fields hash.
            [point],
            BLSPoint::point_at_infinity(),
            BlobAccumulator::empty(),
        );
    }

    #[test(should_fail)]
    fn test_point_not_on_curve_fails() {
        let point = BLSPoint {
            x: BLS12_381_Fq::from_limbs([0, 0, 0, 42]),
            y: BLS12_381_Fq::from_limbs([0, 0, 0, 27]),
            is_infinity: false,
        };
        let _ = evaluate_blobs_and_batch(
            [0; FIELDS_PER_BLOB],
            FIELDS_PER_BLOB,
            123, // Arbitrary blob fields hash.
            [point],
            BLSPoint::point_at_infinity(),
            BlobAccumulator::empty(),
        );
    }

    #[test(should_fail)]
    fn test_kzg_proof_not_on_curve_fails() {
        let point = BLSPoint {
            x: BLS12_381_Fq::from_limbs([0, 0, 0, 42]),
            y: BLS12_381_Fq::from_limbs([0, 0, 0, 27]),
            is_infinity: false,
        };
        let _ = evaluate_blobs_and_batch(
            single_blob_fields(),
            400,
            SINGLE_BLOB_FIELDS_HASH,
            [single_blob_commitment()],
            point,
            BlobAccumulator::empty(),
        );
    }

    // The circuit does not check G1 membership (see `evaluate_blobs_and_batch`). Shifting the real commitment C
    // by a torsion point keeps its G1 component but changes the compressed bytes, so the hash L1 compares
    // against the published commitment no longer matches.
    #[test]
    fn test_torsion_shifted_commitment_changes_blob_commitments_hash() {
        // (0, 2) has order 3.
        let torsion =
            BLSPoint { x: BLS12_381_Fq::zero(), y: BLS12_381_Fq::from(2), is_infinity: false };
        let shifted_commitment = single_blob_commitment() + torsion;

        let res = evaluate_blobs_and_batch::<1>(
            single_blob_fields(),
            400,
            SINGLE_BLOB_FIELDS_HASH,
            [shifted_commitment],
            single_blob_kzg_proof(),
            BlobAccumulator::empty(),
        );
        let final_acc = res.finalize();

        // The published commitment is C or -C (the bytes fix the point up to sign); the hash matches neither.
        let honest = compress_to_blob_commitment(single_blob_commitment());
        let negated = compress_to_blob_commitment(-single_blob_commitment());
        assert(final_acc.blob_commitments_hash != sha256_to_field([1].concat(honest.compressed)));
        assert(final_acc.blob_commitments_hash != sha256_to_field([1].concat(negated.compressed)));
    }
}

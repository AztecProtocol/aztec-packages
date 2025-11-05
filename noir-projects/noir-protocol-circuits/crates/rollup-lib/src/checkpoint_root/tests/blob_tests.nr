use super::TestBuilder;
use bignum::{BigNum, BLS12_381_Fr};
use blob::abis::{BatchingBlobCommitment, BlobAccumulator, FinalBlobBatchingChallenges};
use types::{constants::{BLOBS_PER_BLOCK, FIELDS_PER_BLOB}, hash::poseidon2_hash, traits::Empty};

impl TestBuilder {
    pub fn new_with_one_blob() -> Self {
        Self::new_with_one_blob_and_validate_fixtures(false)
    }

    pub fn new_with_one_blob_and_validate_fixtures(validate_fixtures: bool) -> Self {
        // The below values are generated from block_building_helpers.test.ts.
        let blob_fields_from_ts = [
            0x000000000000000000000000000000000000000000000000000000000000000b,
            0x00000074785f7374617274000000010000000000000000000000000000000004,
            0x000000000000000000000000000000000000000000000000000000000000002a,
            0x000000000000000000000000000000000000000000000000000000000000002a,
            0x0000000000000000000000000000000000000000000000000000000000000123,
            0x00000074785f7374617274000100010000000000000000000000000000000005,
            0x000000000000000000000000000000000000000000000000000000000000002b,
            0x000000000000000000000000000000000000000000000000000000000000003b,
            0x0000000000000000000000000000000000000000000000000000000000006789,
            0x0000000000000000000000000000000000000000000000000000000000000045,
            0x000000000000000000000000000000000000000000626c6f636b5f656e640002,
        ];
        let blob_commitment_limbs_x_from_ts = [
            0xeea216aca5086cb82514e36d660943,
            0x318e0c91287de690d12b98782065e0,
            0x5a56d0e4959d5ff1310b8f4e9be4ce,
            0x0df032,
        ];
        let blob_commitment_limbs_y_from_ts = [
            0xbdeba780b415c20a3d8f999999bfa2,
            0xe584b1462977e23d28ca73625b8ffd,
            0x4ebbeb8dd82c036238216f5ecb8191,
            0x0845a8,
        ];
        let blob_commitment = BatchingBlobCommitment::from_limbs(
            blob_commitment_limbs_x_from_ts,
            blob_commitment_limbs_y_from_ts,
        );
        let blob_commitment_fields_from_ts = [
            0x008df0325a56d0e4959d5ff1310b8f4e9be4ce318e0c91287de690d12b987820,
            0x00000000000000000000000000000065e0eea216aca5086cb82514e36d660943,
        ];
        let challenge_z_from_ts =
            0x0cfa1559ddd669051b7f6a7158c27c5dea85956d05501aa998210831392e370a;

        let mut builder = Self::default_with_blob_fields(blob_fields_from_ts);

        if (validate_fixtures) {
            let blob_commitment_fields = blob_commitment.to_compressed_fields();
            // Check that the hard-coded limbs generate the same blob commitment fields from ts.
            assert_eq(blob_commitment_fields, blob_commitment_fields_from_ts);

            let mut end_sponge_blob = builder.right_rollup.end_sponge_blob;
            let challenge_z = poseidon2_hash([
                end_sponge_blob.squeeze(),
                blob_commitment_fields[0],
                blob_commitment_fields[1],
            ]);
            assert_eq(challenge_z, challenge_z_from_ts);
        }

        builder.hints.blob_commitments[0] = blob_commitment.point;
        builder.hints.start_blob_accumulator = BlobAccumulator::empty();
        builder.hints.final_blob_challenges.z = challenge_z_from_ts;

        builder
    }
}

#[test(should_fail_with = "Attempted to overfill blobs")]
fn overfilled_blob_fields() {
    let mut builder = TestBuilder::default();

    builder.right_rollup.end_sponge_blob.num_expected_fields =
        FIELDS_PER_BLOB * BLOBS_PER_BLOCK + 1;
    builder.right_rollup.end_sponge_blob.num_absorbed_fields =
        FIELDS_PER_BLOB * BLOBS_PER_BLOCK + 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Mismatched expected and actual number of blob fields")]
fn absorbed_too_many_fields() {
    let mut builder = TestBuilder::default_single_block();

    builder.left_rollup.end_sponge_blob.num_expected_fields -= 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Mismatched expected and actual number of blob fields")]
fn absorbed_too_few_fields() {
    let mut builder = TestBuilder::default();

    builder.right_rollup.end_sponge_blob.num_expected_fields += 1;

    builder.execute_with_mock_and_fail();
}

// TODO(#10323): remove the oracle and switch this test to unconstrained.
#[test]
fn correct_end_blob_accumulator_with_one_blob() {
    let builder = TestBuilder::new_with_one_blob_and_validate_fixtures(true);

    let public_inputs = builder.execute();

    builder.assert_expected_public_inputs(public_inputs);

    let end_blob_accumulator = public_inputs.end_blob_accumulator;
    // The final z value is checked in the root rollup. Here we assume there's only one checkpoint in the epoch and
    // validate that the `z_acc` matches what's computed in ts.
    assert_eq(end_blob_accumulator.z_acc, builder.hints.final_blob_challenges.z);
    // We have a single blob, so the accumulated outputs are just those after a single evaluation:
    assert_eq(end_blob_accumulator.c_acc, builder.hints.blob_commitments[0]);

    let expected_gamma_acc =
        poseidon2_hash(end_blob_accumulator.y_acc.get_limbs().map(|l| l as Field));
    assert_eq(end_blob_accumulator.gamma_acc, expected_gamma_acc);
}

// TODO(#10323): remove the oracle and switch this test to unconstrained.
#[test]
fn correct_end_blob_accumulator_with_max_blobs() {
    // Create BLOBS_PER_BLOCK-1 full blobs and 1 blob with 123 fields.
    // Fill BLOBS_PER_BLOCK blobs completely with different values (to avoid a constant polynomial)
    let mut blob_fields = [0; FIELDS_PER_BLOB * (BLOBS_PER_BLOCK - 1) + 123];

    blob_fields[0] = blob_fields.len() as Field;
    for i in 1..blob_fields.len() {
        blob_fields[i] = 456 + i as Field;
    }

    let mut builder = TestBuilder::default_with_blob_fields(blob_fields);

    // All hardcoded values in this test are taken from
    // yarn-project/blob-lib/src/blob_batching.test.ts -> 'should construct and verify a batch of BLOBS_PER_BLOCK full blobs'
    // These values are also used in blob_batching.nr -> test_max_blobs_batched(), but the below ensures inputs are
    // propagated properly through the circuit.
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

    // The final z value is injected as hint and checked for correctness in root rollup.
    // The final gamma value is injected as hint and checked for correctness in root rollup.
    builder.hints.final_blob_challenges = FinalBlobBatchingChallenges {
        // - The final z value is injected and checked for correctness in root (see below final_acc)
        z: z_6_blobs_from_ts,
        // - The final gamma value is injected and checked for correctness in root (see below final_acc)
        gamma: BLS12_381_Fr::from_limbs(gamma_limbs_6_blobs_from_ts),
    };

    let expected_y = BLS12_381_Fr::from_limbs(y_limbs_6_blobs_from_ts);

    let expected_c = BatchingBlobCommitment::from_limbs(
        batched_c_x_limbs_6_blobs_from_ts,
        batched_c_y_limbs_6_blobs_from_ts,
    );

    builder.hints.blob_commitments = kzg_commitments_in;

    let public_inputs = builder.execute();

    builder.assert_expected_public_inputs(public_inputs);

    let end_blob_accumulator = public_inputs.end_blob_accumulator;
    // Assume there's only one checkpoint in the epoch and validate that the `z_acc` matches what's computed in ts.
    assert_eq(end_blob_accumulator.z_acc, builder.hints.final_blob_challenges.z);
    assert_eq(end_blob_accumulator.y_acc, expected_y);
    assert_eq(end_blob_accumulator.c_acc, expected_c.point);
    assert_eq(
        end_blob_accumulator.blob_commitments_hash_acc,
        blob_commitments_hash_6_blobs_from_ts,
    );
}

// TODO(#10323): remove the oracle and switch this test to unconstrained.
#[test(should_fail_with = "Mismatched blob fields hash")]
fn incorrect_injected_blob_fields() {
    let mut builder = TestBuilder::new_with_one_blob();

    let num_blob_fields = builder.left_rollup.start_sponge_blob.num_expected_fields;
    // Set the last field to 0 to make it different from the one that was absorbed.
    builder.hints.blobs_fields[num_blob_fields - 1] = 0;

    builder.execute_and_fail();
}

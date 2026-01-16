use super::TestBuilder;
use bignum::{BigNum, BLS12_381_Fr};
use blob::abis::{BatchingBlobCommitment, BlobAccumulator, FinalBlobBatchingChallenges};
use types::{
    blob_data::create_checkpoint_end_marker,
    constants::{BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB},
    hash::poseidon2_hash,
    traits::Empty,
};

impl TestBuilder {
    pub fn new_with_one_blob() -> Self {
        // The below values are generated from block_building_helpers.test.ts.
        let blob_fields_from_ts = [
            0x0000000000000000000000000000000000000000000000000000007affffff85,
            0x0000000000000000000000000000000000000000000000000000007bffffff84,
            0x0000000000000000000000000000000000000000000000000000007cffffff83,
            0x0000000000000000000000000000000000000000000000000000007dffffff82,
            0x0000000000000000000000000000000000000000000000000000007effffff81,
            0x0000000000000000000000000000636865636b706f696e745f656e6400000006,
        ];
        let blob_commitment_limbs_x_from_ts = [
            0xd31a330b5cd07fc78df6ffe5c7c4d6,
            0xd159ac2a801309b22d1612691ecc97,
            0x57a8799e584eeac804e0e01d8bc4e1,
            0x16e7a4,
        ];
        let blob_commitment_limbs_y_from_ts = [
            0x3eca4d0931923980df2d7e38f25ab9,
            0xaa5610c1f44f9ea433fc8c0646855a,
            0x2e8f65bb5310b1ca0f16d5108d7936,
            0x106c88,
        ];
        let blob_commitment = BatchingBlobCommitment::from_limbs(
            blob_commitment_limbs_x_from_ts,
            blob_commitment_limbs_y_from_ts,
        );
        let challenge_z_from_ts =
            0x214fde23666780cf52da41db2ce5ac67b74907efeecfb183c477063859fd8e4b;

        let mut builder = Self::default_with_blob_fields(blob_fields_from_ts);
        builder.hints.blob_commitments[0] = blob_commitment.point;
        builder.hints.start_blob_accumulator = BlobAccumulator::empty();
        builder.hints.final_blob_challenges.z = challenge_z_from_ts;

        builder
    }
}

#[test(should_fail_with = "Attempted to overfill blobs")]
fn overfilled_blob_fields() {
    let mut builder = TestBuilder::default();

    builder.right_rollup.end_sponge_blob.num_absorbed_fields =
        FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Provided blob fields do not match the fields that were absorbed")]
fn incorrect_injected_blob_fields() {
    let mut builder = TestBuilder::new_with_one_blob();

    // Change the second field.
    builder.hints.blobs_fields[2] += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Provided blob fields do not match the fields that were absorbed")]
fn incorrect_checkpoint_end_marker_in_injected_blob_fields() {
    let mut builder = TestBuilder::new_with_one_blob();

    let num_block_blob_fields = builder.right_rollup.end_sponge_blob.num_absorbed_fields;
    // Override the checkpoint end marker with a random field.
    builder.hints.blobs_fields[num_block_blob_fields] = 99;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Found non-zero field after breakpoint")]
fn non_zero_blob_fields_beyond_absorbed_length() {
    let mut builder = TestBuilder::new_with_one_blob();

    let num_block_blob_fields = builder.right_rollup.end_sponge_blob.num_absorbed_fields;
    // Add a random field beyond the absorbed fields. +1 to take into account the checkpoint end marker.
    builder.hints.blobs_fields[num_block_blob_fields + 1] = 99;

    builder.execute_with_mock_and_fail();
}

// TODO(#10323): remove the oracle and switch this test to unconstrained.
#[test]
fn correct_end_blob_accumulator_with_one_blob() {
    let builder = TestBuilder::new_with_one_blob();

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
    // Create BLOBS_PER_CHECKPOINT full blobs.
    // Fill the blobs completely with different values (to avoid a constant polynomial)
    let mut blob_fields = [0; FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT];
    for i in 0..blob_fields.len() - 1 {
        blob_fields[i] = 456 + i as Field;
    }
    blob_fields[blob_fields.len() - 1] = create_checkpoint_end_marker(blob_fields.len());

    let mut builder = TestBuilder::default_with_blob_fields(blob_fields);

    // All hardcoded values in this test are generated from yarn-project/blob-lib/src/blob_batching.test.ts
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
        0xbf595cd6406168a3c4b66f40965f40,
        0x42c6ec0d08f7f9fbdc1c0518788055,
        0x6dcd2df2fb15c4bdb83c6c57ea0e67,
        0x16afbf,
    ];
    let kzg_commitment_y_limbs_blob_5_from_ts = [
        0xd9e061b50aee8e9edea40ee8e28aff,
        0x05beedf910fb31d43399cf1dea18cf,
        0xe25ad714587e6f3a7e573ce56127e7,
        0x001bd8,
    ];
    let z_6_blobs_from_ts = 0x0d39b1130a385e47a54e3736b57b864cdbb90e7e190856cf80c2be76d4a335f2;
    let gamma_limbs_6_blobs_from_ts =
        [0x31d456aa106e8a1d79ffedb0ed0485, 0x6f4acc25b4f29560ecdc6deea568aa, 0x12fe];
    let y_limbs_6_blobs_from_ts =
        [0x0a2fedb8ba726d2d1ed4394796a031, 0x3822a4e42167ad10a5665c813bd5cd, 0x04ef];
    let batched_c_x_limbs_6_blobs_from_ts = [
        0xc7c19538ef27019a111bcec7742330,
        0x00b03aaf3e1f924a66d83ea8da4efb,
        0x0dc05cbd0b036ea4d7cdcd96f29255,
        0x0abe86,
    ];
    let batched_c_y_limbs_6_blobs_from_ts = [
        0x44122eaa471d7a5ec6947787fbcec7,
        0x431ac1e0466cedd88ceda55f5efaf7,
        0x8eeba206eef1bfc4fc030b1cb7b96d,
        0x03f0a6,
    ];
    let blob_commitments_hash_6_blobs_from_ts =
        0x00f234038a323b2776a3f460156e2e6e21b19221f1b964e74c367204337dd510;

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

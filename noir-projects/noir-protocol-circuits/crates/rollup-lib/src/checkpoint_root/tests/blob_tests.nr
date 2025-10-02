use super::TestBuilder;
use bignum::{BigNum, BLS12_381_Fr};
use blob::abis::{BatchingBlobCommitment, BlobAccumulator};
use types::{constants::{BLOBS_PER_BLOCK, FIELDS_PER_BLOB}, hash::poseidon2_hash, traits::Empty};

impl TestBuilder {
    pub fn new_with_one_blob() -> Self {
        Self::new_with_one_blob_and_validate_fixtures(false)
    }

    pub fn new_with_one_blob_and_validate_fixtures(validate_fixtures: bool) -> Self {
        // The below values are generated from block_building_helpers.test.ts.
        let blob_fields_from_ts = [
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
            0xd7076f471e8dcf04760b9cbe20af06,
            0x7f98239e7b801bb8f4702dc823b873,
            0x699979538c822fec25abc302ed41d7,
            0x03967e,
        ];
        let blob_commitment_limbs_y_from_ts = [
            0xb09910247cca033d8c4ae4747d0c4d,
            0x75b78fca650facfb8e04517bcf9d5e,
            0x5f5131c7c18168ff40d47c7704eb06,
            0x0079d9,
        ];
        let blob_commitment = BatchingBlobCommitment::from_limbs(
            blob_commitment_limbs_x_from_ts,
            blob_commitment_limbs_y_from_ts,
        );
        let blob_commitment_fields_from_ts = [
            0x0083967e699979538c822fec25abc302ed41d77f98239e7b801bb8f4702dc823,
            0x000000000000000000000000000000b873d7076f471e8dcf04760b9cbe20af06,
        ];
        let challenge_z_from_ts =
            0x2f46cba1320559052e1b547aff62d8dec5703b2925f9126cfea89742607f51bd;

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

    builder.right_rollup.end_sponge_blob.expected_fields = FIELDS_PER_BLOB * BLOBS_PER_BLOCK + 1;
    builder.right_rollup.end_sponge_blob.fields = FIELDS_PER_BLOB * BLOBS_PER_BLOCK + 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Mismatched expected and actual number of blob fields")]
fn absorbed_too_many_fields() {
    let mut builder = TestBuilder::default_single_block();

    builder.left_rollup.end_sponge_blob.expected_fields -= 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Mismatched expected and actual number of blob fields")]
fn absorbed_too_few_fields() {
    let mut builder = TestBuilder::default();

    builder.right_rollup.end_sponge_blob.expected_fields += 1;

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
fn correct_end_blob_accumulator_with_full_blobs() {
    // Fill three blobs completely with different values (to avoid a constant polynomial).
    let mut blob_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK] =
        [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK];
    for j in 0..BLOBS_PER_BLOCK {
        for i in 0..FIELDS_PER_BLOB {
            blob_fields[j * FIELDS_PER_BLOB + i] = ((j + 3) * (i + 1)) as Field;
        }
    }

    // All hardcoded values in this test are taken from
    // yarn-project/blob-lib/src/blob_batching.test.ts -> 'should construct and verify a batch of 3 full blobs'
    // These values are also used in blob_batching.nr -> test_full_blobs_batched(), but the below ensures inputs are
    // propagated properly through the circuit.

    // Commitments are injected and checked for correctness on L1 via acc.v
    let injected_blob_commitments = [
        BatchingBlobCommitment::from_limbs(
            [
                0x2627fc88755984d7f002e5ef0e6b3e,
                0x0ea98f6a26672e17f919eb020b00ee,
                0xea6e5173f2ef1bedbb07bfa9ac6ed8,
                0x01c6e6,
            ],
            [
                0xaa96f04ba1d419683f218cc4f15a3f,
                0x8887c5e719583b765309e4b3d18752,
                0x9ff512de37b8582f7167fdfbb29539,
                0x18f531,
            ],
        )
            .point,
        BatchingBlobCommitment::from_limbs(
            [
                0x71556bb7217816fbb3f822fc873740,
                0x9c57d93d7fd33a388e13e95cfdba95,
                0x4f0ddbdc9d6a3653cd825ebd9f5730,
                0x12324e,
            ],
            [
                0xabf9f60fc773ef1802a706d6b170a4,
                0x788f9000166d54151ac05df44e63be,
                0x0a8b45ead129885bb12837fb59033b,
                0x12aadd,
            ],
        )
            .point,
        BatchingBlobCommitment::from_limbs(
            [
                0x69afb94a09e713e7fb94e26f33c3ed,
                0x8161293f65480c3b7bad57aaef1984,
                0xc34d68dc32d1ecd46f46ec4c969bb1,
                0x0d97ef,
            ],
            [
                0x9837a79d9fa4d0370198419b273360,
                0x9e7340f07732e2cb3d51db22b1dcb3,
                0x8285e8cad42f634bb51ad7d2c68a12,
                0x07db3c,
            ],
        )
            .point,
    ];

    // y is a BLS Fr field with value 0x0cd2fd9a46ba70fd7f212d08ec7283024b0b1ff9446b1f78a482fb7443e49b57
    let expected_y_limbs =
        [0x0b1ff9446b1f78a482fb7443e49b57, 0xfd9a46ba70fd7f212d08ec7283024b, 0x0cd2];

    // C is a BLS point with value:
    // x: 0x0f2f5f62cc6c3ab4c1ac1abcb9da9677e12796a76064f68c0d4f659f25a046a6d42616100269935afcb1b98c85d5e93e,
    // y: 0x0af1e4abfa449daf65201c2b24507b1058d8ea9bf82ff948a1d01912615c4a8e507160da282e6c41bab917c868923254,
    let expected_c = BatchingBlobCommitment::from_limbs(
        [
            0x2616100269935afcb1b98c85d5e93e,
            0x96a76064f68c0d4f659f25a046a6d4,
            0x62cc6c3ab4c1ac1abcb9da9677e127,
            0x0f2f5f,
        ],
        [
            0x7160da282e6c41bab917c868923254,
            0xea9bf82ff948a1d01912615c4a8e50,
            0xabfa449daf65201c2b24507b1058d8,
            0x0af1e4,
        ],
    )
        .point;

    let expected_blob_commitments_hash =
        0x00d2f7bffbc5a9008207a188e348e753087f54557a686efd7f74c90cac52a9a1;

    let mut builder = TestBuilder::default_with_blob_fields(blob_fields);

    builder.hints.blob_commitments = injected_blob_commitments;

    // The final z value is injected as hint and checked for correctness in root rollup.
    builder.hints.final_blob_challenges.z =
        0x02d6a54e591ada73e5eea35188a02ac87779f4293ea3e7d675fa50ae7ff332ce;

    // The final gamma value is injected as hint and checked for correctness in root rollup.
    builder.hints.final_blob_challenges.gamma = BLS12_381_Fr::from_limbs([
        0x281287a8d44071d216177e06a02327,
        0x16571aa3dcfef75c2447c705c6c68a,
        0x16f2,
    ]);

    let public_inputs = builder.execute();

    builder.assert_expected_public_inputs(public_inputs);

    let end_blob_accumulator = public_inputs.end_blob_accumulator;
    // Assume there's only one checkpoint in the epoch and validate that the `z_acc` matches what's computed in ts.
    assert_eq(end_blob_accumulator.z_acc, builder.hints.final_blob_challenges.z);
    assert_eq(end_blob_accumulator.y_acc.get_limbs(), expected_y_limbs);
    assert_eq(end_blob_accumulator.c_acc, expected_c);
    assert_eq(end_blob_accumulator.blob_commitments_hash_acc, expected_blob_commitments_hash);
}

// TODO(#10323): remove the oracle and switch this test to unconstrained.
#[test(should_fail_with = "Mismatched blob fields hash")]
fn incorrect_injected_blob_fields() {
    let mut builder = TestBuilder::new_with_one_blob();

    let num_blob_fields = builder.left_rollup.start_sponge_blob.expected_fields;
    // Set the last field to 0 to make it different from the one that was absorbed.
    builder.hints.blobs_fields[num_blob_fields - 1] = 0;

    builder.execute_and_fail();
}

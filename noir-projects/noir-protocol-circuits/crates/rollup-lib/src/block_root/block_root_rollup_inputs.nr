use crate::{
    abis::{
        block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
        block_root_rollup_data::{BlockRootRollupBlobData, BlockRootRollupData},
        previous_rollup_data::PreviousRollupData,
    },
    block_root::components::{
        block_root_rollup_inputs_validator::BlockRootRollupInputsValidator,
        block_root_rollup_output_composer::BlockRootRollupOutputComposer,
    },
};
use types::constants::{
    MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootRollupInputs {
    previous_rollup_data: [PreviousRollupData; 2],
    data: BlockRootRollupData,
    blob_data: BlockRootRollupBlobData,
}

impl BlockRootRollupInputs {
    pub fn block_root_rollup_circuit(self) -> BlockRootOrBlockMergePublicInputs {
        BlockRootRollupInputsValidator::new(
            self.previous_rollup_data,
            ALLOWED_PREVIOUS_CIRCUITS,
            self.data,
        )
            .validate();

        let previous_rollups = [
            self.previous_rollup_data[0].base_or_merge_rollup_public_inputs,
            self.previous_rollup_data[1].base_or_merge_rollup_public_inputs,
        ];
        BlockRootRollupOutputComposer::new_from_two_rollups(previous_rollups, self.data).finish(
            self.blob_data,
        )
    }
}

pub(crate) mod tests {
    use crate::{
        abis::block_root_or_block_merge_public_inputs::{
            BlockRootOrBlockMergePublicInputs, FeeRecipient,
        },
        block_root::block_root_rollup_inputs::BlockRootRollupInputs,
        tests::rollup_fixture_builder::RollupFixtureBuilder,
    };
    use bigint::{BigNum, BLS12_381_Fr as F};
    use blob::blob_batching_public_inputs::BatchingBlobCommitment;
    use types::{
        constants::{BLOBS_PER_BLOCK, FIELDS_PER_BLOB},
        hash::{accumulate_sha256, poseidon2_hash},
        tests::utils::assert_array_eq,
        utils::arrays::array_concat,
    };

    pub struct TestBuilder {
        pub inputs: RollupFixtureBuilder,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let inputs = RollupFixtureBuilder::new_for_block_root();
            inputs.mock_evaluate_blobs_and_batch();
            TestBuilder { inputs }
        }

        pub fn new_with_blobs_fields<let N: u32, let M: u32>(
            blob_fields_0: [Field; N],
            blob_fields_1: [Field; M],
        ) -> Self {
            let inputs = RollupFixtureBuilder::new_for_block_root().with_blobs_fields(
                blob_fields_0,
                blob_fields_1,
            );
            TestBuilder { inputs }
        }

        pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
            BlockRootRollupInputs {
                previous_rollup_data: self.inputs.previous_rollup_data,
                data: self.inputs.to_block_root_rollup_data(),
                blob_data: self.inputs.to_block_root_rollup_blob_data(),
            }
                .block_root_rollup_circuit()
        }
    }

    #[test]
    unconstrained fn correct_block_root_rollup_output() {
        let builder = TestBuilder::new();

        let output = builder.execute();

        let left_rollup = builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        let right_rollup =
            builder.inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs;

        assert_eq(output.previous_archive, left_rollup.constants.last_archive);
        assert(output.new_archive != output.previous_archive);
        assert_eq(output.start_global_variables, left_rollup.constants.global_variables);
        assert_eq(output.end_global_variables, left_rollup.constants.global_variables);

        let expected_out_hash = accumulate_sha256([left_rollup.out_hash, right_rollup.out_hash]);
        assert_eq(output.out_hash, expected_out_hash);

        let expected_fee = FeeRecipient {
            recipient: left_rollup.constants.global_variables.coinbase,
            value: left_rollup.accumulated_fees + right_rollup.accumulated_fees,
        };
        assert_array_eq(output.fees, [expected_fee]);
    }

    #[test]
    fn correct_blob_with_non_empty_fields() {
        // Note: this test will not run in unconstrained, because it reaches the foreign call
        // TODO(#10323): remove the oracle and switch this test to unconstrained

        // The below values are generated from block_building_helper.test.ts.
        let blob_fields_0 = [
            0x000000000000000000000000000000000074785f737461727400000500010000,
            0x000000000000000000000000000000000000000000000000000000000000002a,
            0x0002000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000004000001,
            0x0000000000000000000000000000000000000000000000000000000000000123,
        ];
        let blob_fields_1 = [
            0x000000000000000000000000000000000074785f737461727400000700010000,
            0x000000000000000000000000000000000000000000000000000000000000002b,
            0x0002000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000003000001,
            0x0000000000000000000000000000000000000000000000000000000000006789,
            0x0000000000000000000000000000000000000000000000000000000004000001,
            0x0000000000000000000000000000000000000000000000000000000000000045,
        ];

        let expected_blob_commitment_fields_fixture = [
            0x008c32fe581c8fdba12c0d7597911dead2d937d68525bae655508412bb53bb98,
            0x0000000000000000000000000000006aaa0680f21270e7d8de4e19da5164f95c,
        ];
        let expected_challenge_z_fixture =
            0x1f92b871671f27a378d23f1cef10fbd8f0d90dd7172da9e3c3fc1aa745a072c3;

        // Blob commitment with value:
        // x: 0x0c32fe581c8fdba12c0d7597911dead2d937d68525bae655508412bb53bb986aaa0680f21270e7d8de4e19da5164f95c,
        // y: 0x07896936b96e9af0ecd6ef882c14dcc6e8d075ea61d11ae9df4bfab87396547b5e01b8a35d9a720733acdd92421f24e9,
        let mut injected_blob_commitment = BatchingBlobCommitment::from_limbs(
            [
                0x0680f21270e7d8de4e19da5164f95c,
                0xd68525bae655508412bb53bb986aaa,
                0x581c8fdba12c0d7597911dead2d937,
                0x0c32fe,
            ],
            [
                0x01b8a35d9a720733acdd92421f24e9,
                0x75ea61d11ae9df4bfab87396547b5e,
                0x36b96e9af0ecd6ef882c14dcc6e8d0,
                0x078969,
            ],
        );
        let injected_blob_commitment_fields = injected_blob_commitment.to_compressed_fields();

        let mut builder = TestBuilder::new_with_blobs_fields(blob_fields_0, blob_fields_1);
        builder.inputs.blob_commitments[0] = injected_blob_commitment.point;

        let output = builder.execute();

        let start_sponge_blob = builder.inputs.previous_rollup_data[0]
            .base_or_merge_rollup_public_inputs
            .start_sponge_blob;
        let end_sponge_blob = builder.inputs.previous_rollup_data[1]
            .base_or_merge_rollup_public_inputs
            .end_sponge_blob;
        let blobs_fields = array_concat(blob_fields_0, blob_fields_1);
        let mut expected_sponge = start_sponge_blob;
        expected_sponge.absorb(blobs_fields, blobs_fields.len());
        assert(!end_sponge_blob.eq(start_sponge_blob));
        assert(end_sponge_blob.eq(expected_sponge));

        let hashed_tx_effects = expected_sponge.squeeze();
        let expected_challenge_z = poseidon2_hash([
            hashed_tx_effects,
            injected_blob_commitment_fields[0],
            injected_blob_commitment_fields[1],
        ]);
        let expected_gamma_acc = poseidon2_hash(output
            .blob_public_inputs
            .end_blob_accumulator
            .y_acc
            .get_limbs()
            .map(|l| l as Field));

        // We have a single blob, so the accumulated outputs are just those after a single evaluation:
        assert_eq(output.blob_public_inputs.end_blob_accumulator.z_acc, expected_challenge_z);
        assert_eq(
            output.blob_public_inputs.end_blob_accumulator.z_acc,
            expected_challenge_z_fixture,
        );
        assert_eq(
            output.blob_public_inputs.end_blob_accumulator.c_acc,
            injected_blob_commitment.point,
        );
        assert_eq(injected_blob_commitment_fields, expected_blob_commitment_fields_fixture);
        assert_eq(output.blob_public_inputs.end_blob_accumulator.gamma_acc, expected_gamma_acc);
    }

    // All hardcoded values in this test are taken from yarn-project/foundation/src/blob/blob_batching.test.ts -> 'should construct and verify a batch of 3 full blobs'
    // These values are also used in blob_batching.nr -> test_full_blobs_batched(), but the below ensures inputs are propagated properly throughout block_root
    #[test]
    fn correct_blobs_with_non_empty_fields() {
        // Note: this test will not run in unconstrained, because it reaches the foreign call
        // TODO(#10323): remove the oracle and switch this test to unconstrained
        // Fill three blobs completely with different values (to avoid a constant polynomial)
        let mut blob: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK] =
            [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK];
        for j in 0..BLOBS_PER_BLOCK {
            for i in 0..FIELDS_PER_BLOB {
                blob[j * FIELDS_PER_BLOB + i] = ((j + 3) * (i + 1)) as Field;
            }
        }
        // Init. injected values:
        // - Commitments are injected and checked for correctness on L1 via acc.v
        let kzg_commitments_in = [
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

        let mut builder = TestBuilder::new_with_blobs_fields(blob, []);

        let start_sponge_blob = builder.inputs.previous_rollup_data[0]
            .base_or_merge_rollup_public_inputs
            .start_sponge_blob;
        let mut expected_sponge = start_sponge_blob;
        expected_sponge.absorb(blob, FIELDS_PER_BLOB * BLOBS_PER_BLOCK);
        builder.inputs.blob_commitments = kzg_commitments_in;
        // - The final z value is injected and checked for correctness in root (see below final_acc)
        builder.inputs.final_blob_challenges.z =
            0x02d6a54e591ada73e5eea35188a02ac87779f4293ea3e7d675fa50ae7ff332ce;
        // - The final gamma value is injected and checked for correctness in root (see below final_acc)
        builder.inputs.final_blob_challenges.gamma = F::from_limbs([
            0x281287a8d44071d216177e06a02327,
            0x16571aa3dcfef75c2447c705c6c68a,
            0x16f2,
        ]);

        let output = builder.execute();
        let final_acc = output.blob_public_inputs.end_blob_accumulator;

        assert_eq(final_acc.z_acc, builder.inputs.final_blob_challenges.z);

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

        assert(builder.inputs.previous_rollup_data[1]
            .base_or_merge_rollup_public_inputs
            .end_sponge_blob
            .eq(expected_sponge));

        // blob_commitments_hash is a BN Fr field with value 0x00d2f7bffbc5a9008207a188e348e753087f54557a686efd7f74c90cac52a9a1
        let expected_blob_commitments_hash =
            0xd2f7bffbc5a9008207a188e348e753087f54557a686efd7f74c90cac52a9a1;

        assert_eq(final_acc.y_acc.get_limbs(), expected_y_limbs);
        assert_eq(final_acc.c_acc, expected_c);
        assert_eq(final_acc.blob_commitments_hash_acc, expected_blob_commitments_hash);
    }

    #[test(should_fail_with = "block's first blob sponge was not empty")]
    unconstrained fn non_empty_start_blob_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob.fields =
            1;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "the start state of the block's first tx does not match the state in previous header")]
    unconstrained fn random_block_header_for_first_tx_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.note_hash_tree.root +=
            1;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "input proofs have different note hash tree snapshots")]
    unconstrained fn random_block_header_for_second_tx_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start.note_hash_tree.root +=
            1;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "hash of the previous block header is not the last leaf in the archive tree")]
    unconstrained fn random_previous_block_header_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start.note_hash_tree.root +=
            1;
        builder.inputs.previous_block_header.state.partial.note_hash_tree.root += 1;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "last_l1_to_l2 in constants does not match the value in the previous block header")]
    unconstrained fn mismatch_last_l1_to_l2_snapshot_fails() {
        let mut builder = TestBuilder::new();

        builder.inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.constants.last_l1_to_l2.root +=
            1;
        builder.inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.constants.last_l1_to_l2.root +=
            1;

        let _ = builder.execute();
    }
}

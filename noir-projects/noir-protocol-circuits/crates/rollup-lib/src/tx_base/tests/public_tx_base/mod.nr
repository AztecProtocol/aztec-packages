mod child_proof_vk_tests;
mod end_blob_sponge_tests;
mod out_hash_tests;
mod validate_private_tail_to_public_tests;
mod validate_public_tube_against_avm_tests;

use crate::{
    abis::{PublicTubePublicInputs, TxRollupPublicInputs},
    tests::RollupFixtureBuilder,
    tx_base::public_tx_base_rollup_private_inputs::PublicTxBaseRollupPrivateInputs,
};
use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        avm_circuit_public_inputs::AvmCircuitPublicInputs, block_constant_data::BlockConstantData,
        gas_fees::GasFees, kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
        sponge_blob::SpongeBlob,
    },
    constants::{
        ARCHIVE_HEIGHT, AVM_VK_INDEX, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, PUBLIC_TUBE_VK_INDEX,
    },
    hash::silo_l2_to_l1_message,
    tests::fixture_builder::FixtureBuilder,
};

struct TestBuilder {
    private_tail: PrivateToPublicKernelCircuitPublicInputs,
    public_tube_vk_index: u32,
    public_tube_prover_id: Field,
    avm: AvmCircuitPublicInputs,
    avm_vk_index: u32,
    start_sponge_blob: SpongeBlob,
    last_archive: AppendOnlyTreeSnapshot,
    anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    prover_id: Field,
}

impl TestBuilder {
    pub fn new() -> Self {
        let prover_id = 42;
        // --- Build things at tx level ---
        let mut builder = FixtureBuilder::new();

        builder.prover_id = prover_id;

        builder.gas_used.l2_gas = 111;
        builder.start_gas_used.l2_gas = builder.gas_used.l2_gas;

        builder.tx_context.gas_settings.gas_limits.l2_gas = 444;

        builder.tx_context.gas_settings.teardown_gas_limits.l2_gas = 333;

        builder.tx_context.gas_settings.max_fees_per_gas = GasFees::new(150, 150);

        builder.tx_context.gas_settings.max_priority_fees_per_gas = GasFees::new(100, 100);

        builder.global_variables.gas_fees = GasFees::new(100, 100);

        builder.effective_gas_fees = GasFees::new(150, 150);

        builder.append_nullifiers(1);

        let mut private_tail = builder.to_private_to_public_kernel_circuit_public_inputs();

        let mut avm = builder.to_avm_circuit_public_inputs();

        let contract_class_log_fields = builder.contract_class_log_fields.storage();

        // --- Build things at rollup level ---

        let rollup_fixture_builder = RollupFixtureBuilder::new();

        let block_number = rollup_fixture_builder.start_block_number;

        let start_sponge_blob = rollup_fixture_builder.get_sponge_blob(block_number);

        avm.start_tree_snapshots = rollup_fixture_builder.get_tree_snapshots(block_number - 1);
        avm.end_tree_snapshots = rollup_fixture_builder.get_tree_snapshots(block_number);

        private_tail.constants.anchor_block_header =
            rollup_fixture_builder.get_block_header(block_number);

        let (last_archive, anchor_block_archive_sibling_path) =
            rollup_fixture_builder.build_archive_tree(block_number);

        TestBuilder {
            private_tail,
            public_tube_vk_index: PUBLIC_TUBE_VK_INDEX,
            public_tube_prover_id: prover_id,
            avm,
            avm_vk_index: AVM_VK_INDEX,
            start_sponge_blob,
            last_archive,
            anchor_block_archive_sibling_path,
            contract_class_log_fields,
            prover_id,
        }
    }

    pub fn get_siloed_l2_to_l1_msgs(self) -> [Field; MAX_L2_TO_L1_MSGS_PER_TX] {
        self.avm.accumulated_data.l2_to_l1_msgs.map(|msg| silo_l2_to_l1_message(
            msg,
            self.avm.global_variables.version,
            self.avm.global_variables.chain_id,
        ))
    }

    pub fn update_private_tail_accumulated_data(&mut self, fixture_builder: FixtureBuilder) {
        self.private_tail.non_revertible_accumulated_data =
            fixture_builder.to_private_to_public_accumulated_data(false);
        self.private_tail.revertible_accumulated_data =
            fixture_builder.to_private_to_public_accumulated_data(true);
        self.contract_class_log_fields = fixture_builder.contract_class_log_fields.storage();

        // The data from private tail is also the input data for the avm.
        let avm = fixture_builder.to_avm_circuit_public_inputs();
        self.avm.public_call_request_array_lengths = avm.public_call_request_array_lengths;
        self.avm.public_setup_call_requests = avm.public_setup_call_requests;
        self.avm.public_app_logic_call_requests = avm.public_app_logic_call_requests;
        self.avm.public_teardown_call_request = avm.public_teardown_call_request;
        self.avm.previous_non_revertible_accumulated_data_array_lengths =
            avm.previous_non_revertible_accumulated_data_array_lengths;
        self.avm.previous_non_revertible_accumulated_data =
            avm.previous_non_revertible_accumulated_data;
        self.avm.previous_revertible_accumulated_data_array_lengths =
            avm.previous_revertible_accumulated_data_array_lengths;
        self.avm.previous_revertible_accumulated_data = avm.previous_revertible_accumulated_data;
    }

    pub fn update_avm_accumulated_data(&mut self, fixture_builder: FixtureBuilder) {
        let avm = fixture_builder.to_avm_circuit_public_inputs();
        self.avm.accumulated_data_array_lengths = avm.accumulated_data_array_lengths;
        self.avm.accumulated_data = avm.accumulated_data;
    }

    pub fn execute(self) -> TxRollupPublicInputs {
        let public_tube_public_inputs = PublicTubePublicInputs {
            private_tail: self.private_tail,
            prover_id: self.public_tube_prover_id,
        };
        let public_tube_proof_data = RollupFixtureBuilder::make_proof_data(
            public_tube_public_inputs,
            self.public_tube_vk_index,
        );

        let avm_proof_data = RollupFixtureBuilder::make_proof_data(self.avm, self.avm_vk_index);

        PublicTxBaseRollupPrivateInputs {
            public_tube_proof_data,
            avm_proof_data,
            start_sponge_blob: self.start_sponge_blob,
            last_archive: self.last_archive,
            anchor_block_archive_sibling_path: self.anchor_block_archive_sibling_path,
            contract_class_log_fields: self.contract_class_log_fields,
        }
            .execute()
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn assert_expected_public_inputs(self, pi: TxRollupPublicInputs) {
        assert_eq(pi.num_txs, 1);

        let expected_constants = BlockConstantData {
            last_archive: self.last_archive,
            l1_to_l2_tree_snapshot: self.avm.end_tree_snapshots.l1_to_l2_message_tree,
            vk_tree_root: self.private_tail.constants.vk_tree_root,
            protocol_contracts_hash: self.private_tail.constants.protocol_contracts_hash,
            prover_id: self.prover_id,
            global_variables: self.avm.global_variables,
        };
        assert_eq(pi.constants, expected_constants);

        assert_eq(
            pi.start_tree_snapshots,
            self.avm.start_tree_snapshots.to_partial_state_reference(),
        );
        assert_eq(pi.end_tree_snapshots, self.avm.end_tree_snapshots.to_partial_state_reference());
        // end_tree_snapshots are updated in the avm. The public tx base doesn't care if they are different.
        // But we check that they are different here so that we can be certain the fixtures were set up correctly,
        // and the start and end tree snapshots are copied over from the corresponding values in the avm's pi.
        assert(pi.start_tree_snapshots != pi.end_tree_snapshots);

        assert_eq(pi.start_sponge_blob, self.start_sponge_blob);
        // There's always some values added to the sponge blob for a tx, even when there are no side effects emitted
        // from it. So the end sponge blob is always different from the start sponge blob.
        assert(pi.start_sponge_blob != pi.end_sponge_blob);

        // The expected value of `end_sponge_blob` is tested in `end_sponge_blob_tests.nr`.

        // The expected value of `out_hash` is tested in `out_hash_tests.nr`.

        assert_eq(pi.accumulated_fees, self.avm.transaction_fee);

        assert_eq(pi.accumulated_mana_used, self.avm.end_gas_used.l2_gas as Field);
    }
}

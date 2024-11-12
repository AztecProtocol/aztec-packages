use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
        constant_rollup_data::ConstantRollupData,
    },
    base::{
        base_rollup_inputs::{BaseRollupInputs, KernelData},
        components::{avm_proof_data::AvmProofData, public_tube_data::PublicTubeData},
        state_diff_hints::StateDiffHints,
    },
};
use dep::types::{
    abis::{
        accumulated_data::CombinedAccumulatedData,
        combined_constant_data::CombinedConstantData,
        gas::Gas,
        log_hash::{LogHash, ScopedLogHash},
    },
    constants::{
        ARCHIVE_HEIGHT, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PUBLIC_DATA_TREE_HEIGHT,
        TUBE_VK_INDEX,
    },
    data::{public_data_hint::PublicDataHint, PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
    KernelCircuitPublicInputs,
    merkle_tree::MembershipWitness,
    partial_state_reference::PartialStateReference,
    utils::arrays::array_merge,
};

pub struct PublicBaseRollupInputs {
    tube_data: PublicTubeData,
    avm_proof_data: AvmProofData,

    start: PartialStateReference,

    state_diff_hints: StateDiffHints,
    fee_payer_fee_juice_balance_read_hint: PublicDataHint,

    sorted_public_data_writes: [PublicDataTreeLeaf; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    sorted_public_data_writes_indexes: [u32; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_preimages: [PublicDataTreeLeafPreimage; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_witnesses: [MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    constants: ConstantRollupData,
}

impl PublicBaseRollupInputs {
    fn generate_kernel_circuit_public_inputs(self) -> KernelCircuitPublicInputs {
        let from_private = self.tube_data.public_inputs;
        let from_public = self.avm_proof_data.public_inputs;
        let reverted = from_public.reverted;

        let note_encrypted_logs_hashes = if reverted {
            from_private.non_revertible_accumulated_data.note_encrypted_logs_hashes
        } else {
            array_merge(
                from_private.non_revertible_accumulated_data.note_encrypted_logs_hashes,
                from_private.revertible_accumulated_data.note_encrypted_logs_hashes,
            )
        };
        let encrypted_logs_hashes = if reverted {
            from_private.non_revertible_accumulated_data.encrypted_logs_hashes
        } else {
            array_merge(
                from_private.non_revertible_accumulated_data.encrypted_logs_hashes,
                from_private.revertible_accumulated_data.encrypted_logs_hashes,
            )
        };
        let note_encrypted_log_preimages_length =
            note_encrypted_logs_hashes.fold(0, |len, l: LogHash| len + l.length);
        let encrypted_log_preimages_length =
            encrypted_logs_hashes.fold(0, |len, l: ScopedLogHash| len + l.log_hash.length);
        let unencrypted_log_preimages_length = from_public
            .accumulated_data
            .unencrypted_logs_hashes
            .fold(0, |len, l: ScopedLogHash| len + l.log_hash.length);
        let end = CombinedAccumulatedData {
            note_hashes: from_public.accumulated_data.note_hashes,
            nullifiers: from_public.accumulated_data.nullifiers,
            l2_to_l1_msgs: from_public.accumulated_data.l2_to_l1_msgs,
            note_encrypted_logs_hashes,
            encrypted_logs_hashes,
            unencrypted_logs_hashes: from_public.accumulated_data.unencrypted_logs_hashes,
            note_encrypted_log_preimages_length,
            encrypted_log_preimages_length,
            unencrypted_log_preimages_length,
            public_data_writes: from_public.accumulated_data.public_data_writes,
        };

        let constants =
            CombinedConstantData::combine(from_private.constants, from_public.global_variables);

        let start_state = PartialStateReference {
            note_hash_tree: from_public.start_tree_snapshots.note_hash_tree,
            nullifier_tree: from_public.start_tree_snapshots.nullifier_tree,
            public_data_tree: from_public.start_tree_snapshots.public_data_tree,
        };

        let revert_code = if from_public.reverted { 1 } else { 0 };

        KernelCircuitPublicInputs {
            constants,
            rollup_validation_requests: from_private.rollup_validation_requests,
            end,
            start_state,
            revert_code,
            gas_used: Gas::empty(), // gas_used is not used in rollup circuits.
            fee_payer: from_private.fee_payer,
        }
    }

    pub fn execute(self) -> BaseOrMergeRollupPublicInputs {
        if !dep::std::runtime::is_unconstrained() {
            self.tube_data.verify();
            // TODO(#7410)
            // self.tube_data.vk_data.validate_in_vk_tree([TUBE_VK_INDEX]);
        }

        // TODO(#8470)
        // if !dep::std::runtime::is_unconstrained() {
        //     self.avm_proof_data.verify();
        //     self.avm_proof_data.vk_data.validate_in_vk_tree([AVM_VK_INDEX]);
        // }
        // TODO: Validate tube_data.public_inputs vs avm_proof_data.public_inputs
        // TODO: Deprecate KernelData.
        // Temporary workaround to create KernelCircuitPublicInputs from PublicKernelCircuitPublicInputs and AvmCircuitPublicInputs
        // so that we don't have to modify base_rollup_inputs.
        let public_inputs = self.generate_kernel_circuit_public_inputs();

        BaseRollupInputs {
            kernel_data: KernelData { public_inputs },
            start: self.start,
            state_diff_hints: self.state_diff_hints,
            transaction_fee: self.avm_proof_data.public_inputs.transaction_fee,
            fee_payer_fee_juice_balance_read_hint: self.fee_payer_fee_juice_balance_read_hint,
            sorted_public_data_writes: self.sorted_public_data_writes,
            sorted_public_data_writes_indexes: self.sorted_public_data_writes_indexes,
            low_public_data_writes_preimages: self.low_public_data_writes_preimages,
            low_public_data_writes_witnesses: self.low_public_data_writes_witnesses,
            archive_root_membership_witness: self.archive_root_membership_witness,
            constants: self.constants,
        }
            .base_rollup_circuit()
    }
}

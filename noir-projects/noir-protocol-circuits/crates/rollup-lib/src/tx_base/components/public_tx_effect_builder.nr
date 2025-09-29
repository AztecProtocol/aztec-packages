use crate::{
    abis::TxEffect,
    tx_base::components::{private_tail_validator, tx_blob_data::TxEffectArrayLengths},
};
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmCircuitPublicInputs, contract_class_log::ContractClassLog,
        kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs, log::Log,
    },
    constants::{CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX},
    hash::silo_l2_to_l1_message,
    traits::Hash,
    utils::arrays::{array_length_until, array_merge},
};

pub fn build_tx_effect(
    private_to_public: PrivateToPublicKernelCircuitPublicInputs,
    avm: AvmCircuitPublicInputs,
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
) -> (TxEffect, TxEffectArrayLengths) {
    let reverted = avm.reverted;
    let revert_code = if reverted { 1 } else { 0 };
    let global_variables = avm.global_variables;

    // Silo L2 to L1 messages.
    let siloed_l2_to_l1_msgs = avm.accumulated_data.l2_to_l1_msgs.map(|message| {
        silo_l2_to_l1_message(message, global_variables.version, global_variables.chain_id)
    });

    // Construct private logs.
    let private_logs = if reverted {
        private_to_public.non_revertible_accumulated_data.private_logs
    } else {
        array_merge(
            private_to_public.non_revertible_accumulated_data.private_logs,
            private_to_public.revertible_accumulated_data.private_logs,
        )
    };

    // Construct contract class logs.
    let contract_class_log_hashes = if reverted {
        private_to_public.non_revertible_accumulated_data.contract_class_logs_hashes
    } else {
        array_merge(
            private_to_public.non_revertible_accumulated_data.contract_class_logs_hashes,
            private_to_public.revertible_accumulated_data.contract_class_logs_hashes,
        )
    };

    // Validate the given log fields against the log hashes from kernel circuits.
    private_tail_validator::validate_contract_class_logs(
        contract_class_log_hashes,
        contract_class_log_fields,
    );
    // Assign the log fields with the correct length and contract address.
    let contract_class_logs = contract_class_log_hashes.mapi(|i, log_hash| {
        ContractClassLog {
            log: Log::new(contract_class_log_fields[i], log_hash.inner.length),
            contract_address: log_hash.contract_address,
        }
    });

    let tx_effect = TxEffect {
        tx_hash: private_to_public.hash(),
        revert_code,
        transaction_fee: avm.transaction_fee,
        note_hashes: avm.accumulated_data.note_hashes,
        nullifiers: avm.accumulated_data.nullifiers,
        l2_to_l1_msgs: siloed_l2_to_l1_msgs,
        public_data_writes: avm.accumulated_data.public_data_writes,
        private_logs,
        public_logs: avm.accumulated_data.public_logs,
        contract_class_logs,
    };

    // We can use `array_length_until` to check only the length, because the kernel circuits guarantee that logs with
    // non-zero length are left-packed. In other words, there cannot be a log with length 0 before a log with non-zero
    // length.
    let private_logs_array_length = array_length_until(private_logs, |log| log.length == 0);
    let contract_class_logs_array_length =
        array_length_until(contract_class_log_hashes, |log| log.inner.length == 0);

    let tx_effect_array_lengths = TxEffectArrayLengths {
        note_hashes: avm.accumulated_data_array_lengths.note_hashes,
        nullifiers: avm.accumulated_data_array_lengths.nullifiers,
        l2_to_l1_msgs: avm.accumulated_data_array_lengths.l2_to_l1_msgs,
        public_data_writes: avm.accumulated_data_array_lengths.public_data_writes,
        private_logs: private_logs_array_length,
        contract_class_logs: contract_class_logs_array_length,
    };

    (tx_effect, tx_effect_array_lengths)
}

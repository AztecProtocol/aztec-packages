use crate::{
    abis::TxEffect,
    tx_base::components::{fees::compute_transaction_fee, tx_blob_data::TxEffectArrayLengths},
};
use dep::types::{
    abis::{
        block_constant_data::BlockConstantData, contract_class_log::ContractClassLog,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs, log::Log,
        public_data_write::PublicDataWrite, public_logs::PublicLogs,
    },
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    hash::silo_l2_to_l1_message,
    traits::{Empty, Hash},
    utils::arrays::{array_length, array_length_until},
};

pub fn build_tx_effect(
    private_to_rollup: PrivateToRollupKernelCircuitPublicInputs,
    constants: BlockConstantData,
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    fee_payer_balance_leaf_preimage: PublicDataTreeLeafPreimage,
) -> (TxEffect, TxEffectArrayLengths) {
    let accumulated_data = private_to_rollup.end;

    // Silo L2 to L1 messages.
    let l2_to_l1_msgs = accumulated_data.l2_to_l1_msgs.map(|message| silo_l2_to_l1_message(
        message,
        private_to_rollup.constants.tx_context.version,
        private_to_rollup.constants.tx_context.chain_id,
    ));

    // Compute the transaction fee.
    let transaction_fee = compute_transaction_fee(
        constants.global_variables.gas_fees,
        private_to_rollup.constants.tx_context.gas_settings,
        private_to_rollup.gas_used,
    );

    // Create a `PublicDataWrite` that updates the fee payer's balance in the public data tree.
    // The `fee_payer_balance_leaf_preimage` is validated in `private_tx_base_inputs_validator`.
    let leaf_slot = fee_payer_balance_leaf_preimage.slot;
    let old_balance = fee_payer_balance_leaf_preimage.value;
    let new_balance = old_balance - transaction_fee;
    let fee_payer_balance_write = PublicDataWrite { leaf_slot, value: new_balance };
    let mut public_data_writes =
        [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
    public_data_writes[0] = fee_payer_balance_write;

    // Construct contract class logs from the hashes from kernel circuits and the log fields given via private inputs.
    let contract_class_logs = accumulated_data.contract_class_logs_hashes.mapi(|i, log_hash| {
        ContractClassLog {
            log: Log::new(contract_class_log_fields[i], log_hash.inner.length),
            contract_address: log_hash.contract_address,
        }
    });

    let tx_effect = TxEffect {
        tx_hash: private_to_rollup.hash(),
        revert_code: 0,
        transaction_fee,
        note_hashes: accumulated_data.note_hashes,
        nullifiers: accumulated_data.nullifiers,
        l2_to_l1_msgs,
        public_data_writes,
        private_logs: accumulated_data.private_logs,
        public_logs: PublicLogs::empty(),
        contract_class_logs,
    };

    // We can use `array_length_until` to check only the length, because the kernel circuits guarantee that logs with
    // non-zero length are left-packed. In other words, there cannot be a log with length 0 before a log with non-zero
    // length.
    let private_logs_array_length =
        array_length_until(accumulated_data.private_logs, |log| log.length == 0);
    let contract_class_logs_array_length = array_length_until(
        accumulated_data.contract_class_logs_hashes,
        |log| log.inner.length == 0,
    );

    let tx_effect_array_lengths = TxEffectArrayLengths {
        note_hashes: array_length(accumulated_data.note_hashes),
        nullifiers: array_length(accumulated_data.nullifiers),
        l2_to_l1_msgs: array_length(l2_to_l1_msgs),
        public_data_writes: 1,
        private_logs: private_logs_array_length,
        contract_class_logs: contract_class_logs_array_length,
    };

    (tx_effect, tx_effect_array_lengths)
}

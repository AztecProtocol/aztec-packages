use crate::tx_base::components::fees::compute_transaction_fee;
use super::log_array_length::{
    get_contract_class_log_hash_array_length, get_private_log_array_length,
};
use types::{
    abis::{
        block_constant_data::BlockConstantData, contract_class_log::ContractClassLog,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs, log::Log,
        public_data_write::PublicDataWrite, public_logs::PublicLogs,
    },
    blob_data::{TxEffect, TxEffectArrayLengths},
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    hash::compute_l2_to_l1_message_hash,
    traits::{Empty, Hash},
    utils::arrays::array_length,
};

pub fn build_tx_effect(
    private_to_rollup: PrivateToRollupKernelCircuitPublicInputs,
    constants: BlockConstantData,
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    fee_payer_balance_leaf_preimage: PublicDataTreeLeafPreimage,
) -> (TxEffect, TxEffectArrayLengths) {
    let accumulated_data = private_to_rollup.end;

    // Compute siloed L2-to-L1 message hashes (siloed with the contract address of the function that
    // emitted the message). We do this sequencer-side, because the hashes are computed with sha256
    // for EVM compatibility.
    // The private kernel init and inner circuits add l2_to_l1_msgs with non-zero contract addresses within the
    // claimed length. The private kernel tail circuit ensures that items beyond the claimed length are empty.
    // Therefore, the array is left-packed, and we can safely compute the hashes by checking the contract addresses.
    let l2_to_l1_msgs = accumulated_data.l2_to_l1_msgs.map(|message| if message
        .contract_address
        .is_zero() {
        0
    } else {
        compute_l2_to_l1_message_hash(
            message,
            private_to_rollup.constants.tx_context.version,
            private_to_rollup.constants.tx_context.chain_id,
        )
    });

    // Compute the transaction fee.
    let transaction_fee = compute_transaction_fee(
        constants.global_variables.gas_fees,
        private_to_rollup.constants.tx_context.gas_settings,
        private_to_rollup.gas_used,
    );

    let has_fee_payment = transaction_fee != 0;
    let mut public_data_writes =
        [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
    if has_fee_payment {
        // Create a `PublicDataWrite` that updates the fee payer's balance in the public data tree.
        // The `fee_payer_balance_leaf_preimage` is validated in `private_tx_base_inputs_validator`.
        let leaf_slot = fee_payer_balance_leaf_preimage.slot;
        let old_balance = fee_payer_balance_leaf_preimage.value;
        let new_balance = old_balance - transaction_fee;
        public_data_writes[0] = PublicDataWrite { leaf_slot, value: new_balance };
    }

    // Construct ContractClassLogs from the hashes from kernel circuits and the log fields given via private inputs.
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

    // The Tail kernel circuit guarantees that all accumulated data arrays are "dense-trimmed": all actual data emitted
    // by the tx are non-empty and appear first, followed by empty padding elements. This means it is safe to use
    // `array_length` to get the true logical length of these arrays.
    // For log arrays, we use specialized functions (get_private_log_array_length,
    // get_contract_class_log_hash_array_length) that efficiently determine the length by finding the first zero-length
    // log. Because the kernel enforces that only actual logs have nonzero length and all padding logs have zero length,
    // these functions safely provide the correct count, independent of the log contents themselves.

    let tx_effect_array_lengths = TxEffectArrayLengths {
        note_hashes: array_length(accumulated_data.note_hashes),
        nullifiers: array_length(accumulated_data.nullifiers),
        l2_to_l1_msgs: array_length(l2_to_l1_msgs),
        public_data_writes: if has_fee_payment { 1 } else { 0 },
        private_logs: get_private_log_array_length(accumulated_data.private_logs),
        contract_class_logs: get_contract_class_log_hash_array_length(
            accumulated_data.contract_class_logs_hashes,
        ),
    };

    (tx_effect, tx_effect_array_lengths)
}

use crate::tx_base::components::private_tail_validator;
use types::{
    abis::{
        avm_circuit_public_inputs::AvmCircuitPublicInputs, contract_class_log::ContractClassLog,
        kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs, log::Log,
    },
    blob_data::{TxEffect, TxEffectArrayLengths},
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

    // Compute siloed L2-to-L1 message hashes (siloed with the contract address of the function that
    // emitted the message). We do this sequencer-side, because the hashes are computed with sha256.
    let siloed_l2_to_l1_msgs = avm.accumulated_data.l2_to_l1_msgs.map(|message| {
        silo_l2_to_l1_message(message, global_variables.version, global_variables.chain_id)
    });

    // If any of the public functions reverted within the `avm`, then the tx is considered to have reverted,
    // and none of the tx's _revertible_ side-effects (be they from private or public functions) will be broadcast
    // nor inserted into trees. But, the protocol will still broadcast/insert the _non-revertible_ side-effects
    // of the tx.
    //
    // The non-revertible side-effects exist as a consequence of fee abstraction: the `fee_payer` (whomever
    // has "put themselves on the hook" to pay fees on the user's behalf) must have a guarantee that
    // certain notes/nullifiers/public-state-updates/logs _will_ be included. These "non-revertible
    // side-effects" will typically be the side-effects which represent payment of a fee (through some abstract
    // fee payment mechanism) to the `fee_payer`.
    //
    // Note: the other revertible side-effects (notes, nullifiers, public data updates, l2-to-l1 msgs)
    // are conditionally discarded by the avm circuit. Private logs and contract class logs are
    // different, in that they're only emitted by private functions and so the avm doesn't care about them
    // or "see" them.

    // Conditionally discard the revertible private logs.
    let private_logs = if reverted {
        private_to_public.non_revertible_accumulated_data.private_logs
    } else {
        array_merge(
            private_to_public.non_revertible_accumulated_data.private_logs,
            private_to_public.revertible_accumulated_data.private_logs,
        )
    };

    // Conditionally discard the revertible contract class logs.
    let contract_class_log_hashes = if reverted {
        private_to_public.non_revertible_accumulated_data.contract_class_logs_hashes
    } else {
        array_merge(
            private_to_public.non_revertible_accumulated_data.contract_class_logs_hashes,
            private_to_public.revertible_accumulated_data.contract_class_logs_hashes,
        )
    };

    // Validate the given log fields against the log hashes from kernel circuits.
    // Notice: this validation check is being done here (instead of by this circuit's 'validator',
    // and inconsistently vs the tx-private-base circuit), because in the case of an avm revert,
    // we only wish to reconcile against the contract class log hashes of _non-revertible_ contract
    // class logs -- and the conditional discarding of the revertible logs has only just happened
    // (because we try to avoid mutation within a circuit's 'validator').
    private_tail_validator::validate_contract_class_logs(
        contract_class_log_hashes,
        contract_class_log_fields,
    );

    // Construct ContractClassLogs from the hashes from kernel circuits and the log fields given via private inputs.
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

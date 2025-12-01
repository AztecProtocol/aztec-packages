use dep::types::{
    abis::{gas::Gas, kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs},
    constants::{
        AVM_EMITNOTEHASH_BASE_L2_GAS, AVM_EMITNULLIFIER_BASE_L2_GAS, AVM_SENDL2TOL1MSG_BASE_L2_GAS,
        DA_BYTES_PER_FIELD, DA_GAS_PER_BYTE, FIXED_AVM_STARTUP_L2_GAS,
        L2_GAS_PER_CONTRACT_CLASS_LOG, L2_GAS_PER_L2_TO_L1_MSG, L2_GAS_PER_NOTE_HASH,
        L2_GAS_PER_NULLIFIER, L2_GAS_PER_PRIVATE_LOG,
    },
    traits::Empty,
};

struct BaseL2Gas {
    note_hash: u32,
    nullifier: u32,
    l2_to_l1_msg: u32,
    private_log: u32,
    contract_class_log: u32,
}

global PRIVATE_ONLY_TX_L2_GAS: BaseL2Gas = BaseL2Gas {
    note_hash: L2_GAS_PER_NOTE_HASH,
    nullifier: L2_GAS_PER_NULLIFIER,
    l2_to_l1_msg: L2_GAS_PER_L2_TO_L1_MSG,
    private_log: L2_GAS_PER_PRIVATE_LOG,
    contract_class_log: L2_GAS_PER_CONTRACT_CLASS_LOG,
};

global PUBLIC_TX_L2_GAS: BaseL2Gas = BaseL2Gas {
    note_hash: AVM_EMITNOTEHASH_BASE_L2_GAS,
    nullifier: AVM_EMITNULLIFIER_BASE_L2_GAS,
    l2_to_l1_msg: AVM_SENDL2TOL1MSG_BASE_L2_GAS,
    private_log: L2_GAS_PER_PRIVATE_LOG,
    contract_class_log: L2_GAS_PER_CONTRACT_CLASS_LOG,
};

/// Meter the gas used for a private or public tx.
///
/// Data added to the blob will be counted towards DA fields.
/// See `types/src/blob_data/tx_blob_data.nr` for what's included in the blob.
pub fn meter_gas_used(public_inputs: PrivateKernelCircuitPublicInputs, is_for_public: bool) -> Gas {
    let mut metered_da_fields = 0;
    let mut metered_l2_gas = 0;

    let data = public_inputs.end;
    let l2_gas = if is_for_public {
        PUBLIC_TX_L2_GAS
    } else {
        PRIVATE_ONLY_TX_L2_GAS
    };

    let num_note_hashes = data.note_hashes.length;
    metered_da_fields += num_note_hashes;
    metered_l2_gas += num_note_hashes * l2_gas.note_hash;

    let num_nullifiers = data.nullifiers.length;
    metered_da_fields += num_nullifiers;
    metered_l2_gas += num_nullifiers * l2_gas.nullifier;

    let num_l2_to_l1_msgs = data.l2_to_l1_msgs.length;
    metered_da_fields += num_l2_to_l1_msgs;
    metered_l2_gas += num_l2_to_l1_msgs * l2_gas.l2_to_l1_msg;

    let num_private_logs = data.private_logs.length;
    metered_da_fields += data.private_logs.array.fold(0, |acc, l| acc + l.innermost().log.length);
    // Add `num_private_logs` da fields below because each private log emits its length as an additional field.
    // It is slightly more efficient to account for all extra fields at once, rather than adding one field per log individually.
    metered_da_fields += num_private_logs;
    metered_l2_gas += num_private_logs * l2_gas.private_log;

    let num_contract_class_logs = data.contract_class_logs_hashes.length;
    metered_da_fields +=
        data.contract_class_logs_hashes.array.fold(0, |acc, l| acc + l.innermost().length);
    // Add `num_contract_class_logs` da fields below because each contract class log emits its contract address as an
    // additional field.
    // It is slightly more efficient to account for all extra fields at once, rather than adding one field per log individually.
    metered_da_fields += num_contract_class_logs;
    metered_l2_gas += num_contract_class_logs * l2_gas.contract_class_log;

    if is_for_public {
        let num_public_call_requests = data.public_call_requests.length;
        metered_l2_gas += num_public_call_requests * FIXED_AVM_STARTUP_L2_GAS;
        // Public call requests don't count towards DA fields.
    }

    let teardown_gas = if !is_for_public | public_inputs.public_teardown_call_request.is_empty() {
        Gas::empty()
    } else {
        public_inputs.constants.tx_context.gas_settings.teardown_gas_limits
    };

    let metered_da_gas = metered_da_fields * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;

    Gas::tx_overhead() + Gas::new(metered_da_gas, metered_l2_gas) + teardown_gas
}

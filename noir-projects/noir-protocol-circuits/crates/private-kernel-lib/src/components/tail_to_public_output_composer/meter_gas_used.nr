use dep::types::{
    abis::{
        accumulated_data::PrivateToPublicAccumulatedData, gas::Gas, log_hash::ScopedLogHash,
        public_call_request::PublicCallRequest,
    },
    constants::{
        DA_BYTES_PER_FIELD, DA_GAS_PER_BYTE, FIXED_AVM_STARTUP_L2_GAS, L2_GAS_PER_L2_TO_L1_MSG,
        L2_GAS_PER_LOG_BYTE, L2_GAS_PER_NOTE_HASH, L2_GAS_PER_NULLIFIER, L2_GAS_PER_PRIVATE_LOG,
        PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    traits::is_empty,
    utils::arrays::array_length,
};

fn meter_accumulated_data_gas_used(data: PrivateToPublicAccumulatedData) -> Gas {
    let mut metered_da_fields = 0;
    let mut metered_l2_gas = 0;

    let num_note_hashes = array_length(data.note_hashes);
    metered_da_fields += num_note_hashes;
    metered_l2_gas += num_note_hashes * L2_GAS_PER_NOTE_HASH;

    let num_nullifiers = array_length(data.nullifiers);
    metered_da_fields += num_nullifiers;
    metered_l2_gas += num_nullifiers * L2_GAS_PER_NULLIFIER;

    let num_l2_to_l1_msgs = array_length(data.l2_to_l1_msgs);
    metered_da_fields += num_l2_to_l1_msgs;
    metered_l2_gas += num_l2_to_l1_msgs * L2_GAS_PER_L2_TO_L1_MSG;

    let num_private_logs = array_length(data.private_logs);
    metered_da_fields += num_private_logs * PRIVATE_LOG_SIZE_IN_FIELDS;
    metered_l2_gas += num_private_logs * L2_GAS_PER_PRIVATE_LOG;

    let mut metered_da_bytes = metered_da_fields * DA_BYTES_PER_FIELD;
    let contract_class_log_preimages_length =
        data.contract_class_logs_hashes.fold(0, |len, l: ScopedLogHash| len + l.log_hash.length);
    metered_da_bytes += contract_class_log_preimages_length as u32;
    metered_l2_gas += contract_class_log_preimages_length as u32 * L2_GAS_PER_LOG_BYTE;

    metered_l2_gas += array_length(data.public_call_requests) * FIXED_AVM_STARTUP_L2_GAS;

    Gas::new(metered_da_bytes * DA_GAS_PER_BYTE, metered_l2_gas)
}

pub fn meter_gas_used(
    non_revertible_data: PrivateToPublicAccumulatedData,
    revertible_data: PrivateToPublicAccumulatedData,
    public_teardown_call_request: PublicCallRequest,
    teardown_gas_limits: Gas,
) -> Gas {
    let teardown_gas = if is_empty(public_teardown_call_request) {
        Gas::empty()
    } else {
        teardown_gas_limits
    };

    Gas::tx_overhead()
        + meter_accumulated_data_gas_used(non_revertible_data)
        + meter_accumulated_data_gas_used(revertible_data)
        + teardown_gas
}

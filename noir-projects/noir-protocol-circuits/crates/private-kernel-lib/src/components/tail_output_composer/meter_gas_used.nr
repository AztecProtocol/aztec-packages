use dep::types::{
    abis::{
        accumulated_data::private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData,
        gas::Gas, private_log::get_emitted_private_log_fields_len,
    },
    constants::{
        DA_BYTES_PER_FIELD, DA_GAS_PER_BYTE, L2_GAS_PER_L2_TO_L1_MSG, L2_GAS_PER_LOG_BYTE,
        L2_GAS_PER_NOTE_HASH, L2_GAS_PER_NULLIFIER, L2_GAS_PER_PRIVATE_LOG,
    },
    utils::arrays::array_length,
};

pub fn meter_gas_used(data: PrivateToRollupAccumulatedData) -> Gas {
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

    // Note: not sure if we should be measuring gas in bytes since we use blobs?
    let num_private_logs = array_length(data.private_logs);
    /// Safety: the length below is constrained in rollup base. Should we constrain it here?
    let total_num_private_log_fields =
        unsafe { get_emitted_private_log_fields_len(data.private_logs) };
    metered_da_fields += total_num_private_log_fields;
    metered_l2_gas += num_private_logs * L2_GAS_PER_PRIVATE_LOG;

    let mut metered_da_bytes = metered_da_fields * DA_BYTES_PER_FIELD;
    metered_da_bytes += data.contract_class_log_preimages_length as u32;
    metered_l2_gas += data.contract_class_log_preimages_length as u32 * L2_GAS_PER_LOG_BYTE;

    Gas::new(metered_da_bytes * DA_GAS_PER_BYTE, metered_l2_gas) + Gas::tx_overhead()
}

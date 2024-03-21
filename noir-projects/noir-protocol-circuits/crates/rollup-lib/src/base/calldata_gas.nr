use dep::types::abis::accumulated_data::CombinedAccumulatedData;
use dep::types::abis::side_effect::{SideEffect, SideEffectLinkedToNoteHash};
use dep::types::traits::is_empty;
use dep::types::constants::{
    MAX_NEW_NULLIFIERS_PER_TX, MAX_NEW_NOTE_HASHES_PER_TX, MAX_NEW_L2_TO_L1_MSGS_PER_TX,
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
};

global FIXED_DA_GAS: u64 = 272;
global DA_GAS_PER_BYTE: u64 = 16;

pub fn compute_calldata_da_gas(data: CombinedAccumulatedData) -> u64 {
    let mut non_zero_bytes = (data.unencrypted_log_preimages_length + data.encrypted_log_preimages_length) as u64;

    for i in 0..MAX_NEW_NOTE_HASHES_PER_TX {
        if !is_empty(data.new_note_hashes[i]) {
            non_zero_bytes += 32;
        }
    }

    for i in 0..MAX_NEW_NULLIFIERS_PER_TX {
        if !is_empty(data.new_nullifiers[i]) {
            non_zero_bytes += 32;
        }
    }

    for i in 0..MAX_NEW_L2_TO_L1_MSGS_PER_TX {
        if !is_empty(data.new_l2_to_l1_msgs[i]) {
            non_zero_bytes += 32;
        }
    }

    for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
        if !is_empty(data.public_data_update_requests[i]) {
            non_zero_bytes += 64;
        }
    }

    non_zero_bytes * DA_GAS_PER_BYTE + FIXED_DA_GAS
}

pub fn compute_calldata_compute_gas(data: CombinedAccumulatedData) -> u64 {
    data.compute_gas_used
}

mod tests {

    use dep::types::abis::accumulated_data::{CombinedAccumulatedDataBuilder, CombinedAccumulatedData};

    use crate::base::calldata_gas::compute_calldata_da_gas;

    #[test]
    fn test_compute_calldata_gas() {
        let mut builder: CombinedAccumulatedDataBuilder = dep::std::unsafe::zeroed();
        builder.unencrypted_log_preimages_length = 4;
        builder.encrypted_log_preimages_length = 4;
        let data = builder.finish();
        // see calldata_tx_effect_factory.test.ts for the expected value
        assert_eq(compute_calldata_da_gas(data), 400);
    }
}


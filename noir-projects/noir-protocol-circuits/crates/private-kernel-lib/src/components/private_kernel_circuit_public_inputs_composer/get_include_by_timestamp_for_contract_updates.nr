use dep::types::{
    abis::private_kernel::private_call_data::PrivateCallData,
    constants::DEFAULT_UPDATE_DELAY,
    contract_class_id::ContractClassId,
    shared_mutable::{compute_shared_mutable_time_horizon, SharedMutableValues},
    traits::Packable,
};

pub fn get_include_by_timestamp_for_contract_updates(private_call: PrivateCallData) -> u64 {
    let shared_mutable_values: SharedMutableValues<ContractClassId, DEFAULT_UPDATE_DELAY> = Packable::unpack(
        private_call.verification_key_hints.updated_class_id_shared_mutable_values,
    );
    compute_shared_mutable_time_horizon(
        shared_mutable_values,
        private_call.public_inputs.historical_header.global_variables.timestamp,
    )
}

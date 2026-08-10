use types::{
    abis::private_kernel::private_call_data::PrivateCallData,
    constants::DEFAULT_UPDATE_DELAY,
    contract_class_id::ContractClassId,
    delayed_public_mutable::{
        compute_delayed_public_mutable_time_horizon, DelayedPublicMutableValues,
    },
    traits::Packable,
};

/// Computes the expiration_timestamp value for contract updates based on the delayed public mutable values stored inside
/// the `private_call`. The timestamp is set to the time horizon value of the given `DelayedPublicMutable`.
/// See documentation of the `get_time_horizon` function in
/// `noir-projects/fnd/noir-protocol-circuits/crates/types/src/delayed_public_mutable/scheduled_value_change.nr` for more details
/// on what is a time horizon.
pub fn get_expiration_timestamp_for_contract_updates(private_call: PrivateCallData) -> u64 {
    // `updated_class_id_delayed_public_mutable_values` is constrained against the public data tree
    // by `validate_contract_address` (via `read_current_value_of_delayed_public_mutable_with_hash`).
    let delayed_public_mutable_values: DelayedPublicMutableValues<ContractClassId, DEFAULT_UPDATE_DELAY> = Packable::unpack(
        private_call.verification_key_hints.updated_class_id_delayed_public_mutable_values,
    );
    compute_delayed_public_mutable_time_horizon(
        delayed_public_mutable_values,
        private_call.public_inputs.anchor_block_header.global_variables.timestamp,
    )
}

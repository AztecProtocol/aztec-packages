use crate::tests::private_kernel_init::TestBuilder;
use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul as derive_public_key};
use types::{
    abis::protocol_contracts::ProtocolContracts,
    address::AztecAddress,
    constants::{DEFAULT_UPDATE_DELAY, MAX_PROTOCOL_CONTRACTS},
    delayed_public_mutable::scheduled_delay_change::ScheduledDelayChange,
    traits::FromField,
};

impl TestBuilder {
    pub fn new_with_regular_contract() -> Self {
        TestBuilder::new()
    }

    pub fn new_with_protocol_contract() -> Self {
        let mut builder = TestBuilder::new();

        let protocol_contract_address = AztecAddress::from_field(1);
        builder.set_contract_address(protocol_contract_address);

        let _ =
            builder.private_call.use_protocol_contract(0 /* contract address 1 is at index 0 */);

        builder.tx_request.function_data = builder.private_call.function_data;

        builder
    }

    pub fn set_contract_address(&mut self, contract_address: AztecAddress) {
        self.private_call.contract_address = contract_address;
        self.tx_request.origin = contract_address;
    }
}

// --- Regular contract ---

#[test(should_fail_with = "computed contract address does not match expected one")]
fn with_zero_address() {
    let mut builder = TestBuilder::new_with_regular_contract();

    // Set the contract_address to 0.
    builder.set_contract_address(AztecAddress::zero());

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn incorrect_function_leaf_index() {
    let mut builder = TestBuilder::new_with_regular_contract();

    // Set the leaf index of the function leaf to a wrong value (the correct value + 1).
    let leaf_index = builder.private_call.function_leaf_membership_witness.leaf_index;
    builder.private_call.function_leaf_membership_witness.leaf_index = leaf_index + 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn incorrect_function_leaf_sibling_path() {
    let mut builder = TestBuilder::new_with_regular_contract();

    // Set the first value of the sibling path to a wrong value (the correct value + 1).
    let sibling_path_0 = builder.private_call.function_leaf_membership_witness.sibling_path[0];
    builder.private_call.function_leaf_membership_witness.sibling_path[0] = sibling_path_0 + 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn incorrect_contract_class_preimage() {
    let mut builder = TestBuilder::new_with_regular_contract();

    builder.private_call.contract_class_artifact_hash =
        builder.private_call.contract_class_artifact_hash + 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn incorrect_partial_address_preimage() {
    let mut builder = TestBuilder::new_with_regular_contract();

    builder.private_call.salted_initialization_hash.inner =
        builder.private_call.salted_initialization_hash.inner + 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn incorrect_address_preimage() {
    let mut builder = TestBuilder::new_with_regular_contract();

    builder.private_call.public_keys.ivpk_m.inner =
        derive_public_key(EmbeddedCurveScalar::from_field(69)).into();

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn incorrect_vk_hash() {
    let mut builder = TestBuilder::new_with_regular_contract();

    // Change the vk hash so the address doesn't match anymore
    builder.private_call.vk.hash += 1;

    builder.execute_and_fail();
}

// --- Protocol contract ---

#[test]
fn with_protocol_contract() {
    let builder = TestBuilder::new_with_protocol_contract();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "computed contract address does not match protocol contract derived address")]
fn protocol_contract_mismatch_computed_address() {
    let mut builder = TestBuilder::new_with_protocol_contract();

    let mut derived_addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
    // Tweak the derived address of the protocol contract (address 1 is at index 0)
    derived_addresses[0] = AztecAddress::from_field(42);
    builder.private_call.protocol_contracts = ProtocolContracts::new(derived_addresses);

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match protocol contract derived address")]
fn protocol_contract_mismatch_contract() {
    let mut builder = TestBuilder::new_with_protocol_contract();

    // Change to another contract address.
    builder.private_call.contract_address.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match protocol contract derived address")]
fn protocol_contract_incorrect_hint() {
    let mut builder = TestBuilder::new_with_protocol_contract();

    builder.private_call.salted_initialization_hash.inner += 1;

    builder.execute_and_fail();
}

// --- Updated contract ---

#[test]
fn with_updated_contract_class_id() {
    let mut builder = TestBuilder::new_with_regular_contract();

    builder.private_call.use_updated_contract(
        builder.private_call.anchor_block_header.global_variables.timestamp,
    );

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract class id does not match updated contract class id")]
fn updated_contract_not_yet_updated() {
    let mut builder = TestBuilder::new_with_regular_contract();

    // The update is scheduled at after the current block timestamp.
    builder.private_call.use_updated_contract(
        builder.private_call.anchor_block_header.global_variables.timestamp + 1,
    );

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract class id does not match updated contract class id")]
fn updated_contract_mismatch_computed_class_id() {
    let mut builder = TestBuilder::new_with_regular_contract();

    builder.private_call.use_updated_contract(
        builder.private_call.anchor_block_header.global_variables.timestamp,
    );

    builder.private_call.contract_class_artifact_hash += 1;

    builder.execute_and_fail();
}

// Regression: when the updated-class-id hash slot is uninitialized (i.e. the public-data leaf is
// absent and the read returns 0), the delayed-public-mutable hint must be zeroed. Otherwise the
// same hint is later reused by `get_expiration_timestamp_for_contract_updates`, where a non-zeroed
// delay change would yield a time horizon further in the future than the storage state warrants.
// This test guards the kernel path specifically, so a future refactor cannot leave the helper test
// in `delayed_public_mutable/with_hash.nr` passing while accidentally bypassing the check here.
#[test(should_fail_with = "delayed_public_mutable must be zeroed when its stored hash is zero")]
fn uninitialized_updated_class_id_rejects_non_zeroed_delay_hint() {
    let mut builder = TestBuilder::new_with_regular_contract();

    // The builder's public-data witness proves the updated-class-id hash slot is absent. Mutate
    // only the delayed mutable hint to the stale-read-extending shape (value stays empty, delay
    // metadata is non-zeroed).
    builder.private_call.updated_class_id_delay_change = ScheduledDelayChange::<DEFAULT_UPDATE_DELAY>::new(
        Option::none(),
        Option::some(DEFAULT_UPDATE_DELAY + 1),
        0,
    );

    builder.execute_and_fail();
}

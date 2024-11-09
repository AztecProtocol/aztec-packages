use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;
use dep::types::address::AztecAddress;
use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul as derive_public_key};
use types::hash::verification_key_hash;

impl PrivateCallDataValidatorBuilder {
    pub fn new_with_regular_contract() -> Self {
        let mut builder = PrivateCallDataValidatorBuilder::new();
        builder.private_call.set_protocol_contract_root();
        builder
    }

    pub fn new_with_protocol_contract() -> Self {
        let mut builder = PrivateCallDataValidatorBuilder::new();
        let _ = builder.private_call.use_protocol_contract();
        builder
    }
}

#[test(should_fail_with = "contract address cannot be zero")]
fn validate_contract_address_zero_address_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    // Set the contract_address to 0.
    builder.private_call.contract_address = AztecAddress::zero();

    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_incorrect_function_leaf_index_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    // Set the leaf index of the function leaf to a wrong value (the correct value + 1).
    let leaf_index = builder.private_call.function_leaf_membership_witness.leaf_index;
    builder.private_call.function_leaf_membership_witness.leaf_index = leaf_index + 1;

    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_incorrect_function_leaf_sibling_path_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    // Set the first value of the sibling path to a wrong value (the correct value + 1).
    let sibling_path_0 = builder.private_call.function_leaf_membership_witness.sibling_path[0];
    builder.private_call.function_leaf_membership_witness.sibling_path[0] = sibling_path_0 + 1;

    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_incorrect_contract_class_preimage_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    builder.private_call.contract_class_artifact_hash =
        builder.private_call.contract_class_artifact_hash + 1;

    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_incorrect_partial_address_preimage_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    builder.private_call.salted_initialization_hash.inner =
        builder.private_call.salted_initialization_hash.inner + 1;

    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_incorrect_address_preimage_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    builder.private_call.public_keys.ivpk_m.inner =
        derive_public_key(EmbeddedCurveScalar::from_field(69));

    builder.validate();
}

#[test]
fn validate_contract_address_protocol_contract_succeeds() {
    let builder = PrivateCallDataValidatorBuilder::new_with_protocol_contract();
    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_protocol_contract_wrong_index_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_protocol_contract();

    builder.private_call.contract_address.inner += 1;

    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_protocol_contract_wrong_computed_address_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_protocol_contract();

    builder.private_call.salted_initialization_hash.inner += 1;

    builder.validate();
}

#[test(should_fail_with = "Invalid VK hash")]
fn validate_contract_address_wrong_vk_hash_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    // Fake the vk hash so it doesn't match the preimage
    builder.private_call.client_ivc_vk.hash = 27;

    builder.validate();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address_wrong_vk_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_regular_contract();

    // Change the VK so the address doesn't match anymore
    builder.private_call.client_ivc_vk.key[0] = 27;
    builder.private_call.client_ivc_vk.hash =
        verification_key_hash(builder.private_call.client_ivc_vk.key);

    builder.validate();
}

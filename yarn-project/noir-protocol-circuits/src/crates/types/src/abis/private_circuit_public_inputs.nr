use crate::{
    abis::{
        call_context::CallContext,
        nullifier_key_validation_request::NullifierKeyValidationRequest,
        side_effect::{SideEffect, SideEffectLinkedToNoteHash},
    },
    contrakt::deployment_data::ContractDeploymentData,
    hash::pedersen_hash,
    header::Header,
};
use crate::constants::{
        MAX_READ_REQUESTS_PER_CALL,
        MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL,
        MAX_NEW_COMMITMENTS_PER_CALL,
        MAX_NEW_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
        MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
        MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
        NUM_FIELDS_PER_SHA256,
        RETURN_VALUES_LENGTH,
        PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        GENERATOR_INDEX__PRIVATE_CIRCUIT_PUBLIC_INPUTS,
};
use crate::traits::{Hash, Serialize};

struct PrivateCircuitPublicInputs {
    call_context: CallContext,
    
    args_hash: Field,
    return_values: [Field; RETURN_VALUES_LENGTH],

    read_requests: [SideEffect; MAX_READ_REQUESTS_PER_CALL],
    nullifier_key_validation_requests: [NullifierKeyValidationRequest; MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL],

    new_commitments: [SideEffect; MAX_NEW_COMMITMENTS_PER_CALL],
    new_nullifiers: [SideEffectLinkedToNoteHash; MAX_NEW_NULLIFIERS_PER_CALL],
    private_call_stack_hashes: [Field; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL],
    public_call_stack_hashes: [Field; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL],
    new_l2_to_l1_msgs: [Field; MAX_NEW_L2_TO_L1_MSGS_PER_CALL],
    end_side_effect_counter : u32,

    encrypted_logs_hash: [Field; NUM_FIELDS_PER_SHA256],
    unencrypted_logs_hash: [Field; NUM_FIELDS_PER_SHA256],

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    encrypted_log_preimages_length: Field,
    unencrypted_log_preimages_length: Field,

    // Header of a block whose state is used during private execution (not the block the transaction is included in).
    historical_header: Header,

    contract_deployment_data: ContractDeploymentData,

    // Note: The following 2 values are not redundant to the values in self.historical_header.global_variables because
    // they can be different in case of a protocol upgrade. In such a situation we could be using header from a block
    // before the upgrade took place but be using the updated protocol to execute and prove the transaction.
    chain_id: Field,
    version: Field,
}

impl Serialize<PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateCircuitPublicInputs {
    fn serialize(self) -> [Field; PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new(0); 
        fields.extend_from_array(self.call_context.serialize()); // 8
        fields.push(self.args_hash); // 9
        fields.extend_from_array(self.return_values); // 13

        for i in 0..MAX_READ_REQUESTS_PER_CALL{
            fields.extend_from_array(self.read_requests[i].serialize());
        } // 13 + (2 * 32) = 77
        for i in 0..MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL{
            fields.extend_from_array(self.nullifier_key_validation_requests[i].serialize());
        } // 77 + (2 * 16) = 109
        for i in 0..MAX_NEW_COMMITMENTS_PER_CALL{
            fields.extend_from_array(self.new_commitments[i].serialize());
        } // 77 + (2 * 16) = 109
        for i in 0..MAX_NEW_NULLIFIERS_PER_CALL{
            fields.extend_from_array(self.new_nullifiers[i].serialize());
        } // 109 + (16 * 3) = 157
        fields.extend_from_array(self.private_call_stack_hashes); // 157 + 4 = 161
        fields.extend_from_array(self.public_call_stack_hashes); // 161 + 4 = 165
        fields.extend_from_array(self.new_l2_to_l1_msgs); // 165 + 2 = 167
        fields.push(self.end_side_effect_counter as Field); // 168
        fields.extend_from_array(self.encrypted_logs_hash); // 168 + 2 = 170
        fields.extend_from_array(self.unencrypted_logs_hash); // 170 + 2 = 172
        fields.push(self.encrypted_log_preimages_length); // 173
        fields.push(self.unencrypted_log_preimages_length); // 174
        fields.extend_from_array(self.historical_header.serialize()); // 174 + 18 = 192
        fields.extend_from_array(self.contract_deployment_data.serialize()); // 192 + 6 = 198
        fields.push(self.chain_id); // 199
        fields.push(self.version); // 200

        dep::std::println(fields.len());

        assert_eq(fields.len(), PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage
    }
}

impl Hash for PrivateCircuitPublicInputs {
    fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__PRIVATE_CIRCUIT_PUBLIC_INPUTS)
    }
}

#[test]
fn serialization_smoke() {
    let pcpi: PrivateCircuitPublicInputs = dep::std::unsafe::zeroed();
    let _serialized = pcpi.serialize();
}

#[test]
fn hash_smoke() {
    let pcpi: PrivateCircuitPublicInputs = dep::std::unsafe::zeroed();
    let _hashed = pcpi.hash();
}

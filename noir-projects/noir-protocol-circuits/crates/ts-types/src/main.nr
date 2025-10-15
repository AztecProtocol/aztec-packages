use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmCircuitPublicInputs, log_hash::LogHash,
        note_hash_leaf_preimage::NoteHashLeafPreimage, nullifier::Nullifier,
        nullifier_leaf_preimage::NullifierLeafPreimage, private_call_request::PrivateCallRequest,
        private_log::PrivateLogData, public_call_request::PublicCallRequest,
        validation_requests::key_validation_request_and_generator::KeyValidationRequestAndGenerator,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    side_effect::Counted,
};

// This is a temporary workaround to make the noir codegen generate the ts type definitions for the following structs.
// Remove this file once this issue is fixed: https://github.com/noir-lang/noir/issues/9026
fn main(
    _nullifier: Nullifier,
    _private_log_data: PrivateLogData,
    _log_hash: LogHash,
    _private_call_request: PrivateCallRequest,
    _public_call_request: PublicCallRequest,
    _key_validation_request: KeyValidationRequestAndGenerator,
    _note_hash_leaf_preimage: NoteHashLeafPreimage,
    _nullifier_leaf_preimage: NullifierLeafPreimage,
    _l2_to_l1_message: L2ToL1Message,
    _counted: Counted<u32>,
    _avm_circuit_public_inputs: AvmCircuitPublicInputs,
) {}

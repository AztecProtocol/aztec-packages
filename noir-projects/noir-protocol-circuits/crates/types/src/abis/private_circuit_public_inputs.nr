use crate::{
    abis::{
        block_header::BlockHeader, call_context::CallContext, log_hash::LogHash,
        note_hash::NoteHash, nullifier::Nullifier, private_call_request::PrivateCallRequest,
        private_log::PrivateLogData, public_call_request::PublicCallRequest,
        transaction::tx_context::TxContext, validation_requests::KeyValidationRequestAndGenerator,
    },
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL,
        MAX_KEY_VALIDATION_REQUESTS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
        PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    side_effect::{Counted, scoped::Scoped},
    traits::{Deserialize, Empty, Serialize},
    utils::arrays::ClaimedLengthArray,
};
use std::meta::derive;

// Public inputs to private app circuit.
#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateCircuitPublicInputs {
    // The context of this function call.
    pub call_context: CallContext,

    // The hash of the arguments for this function call.
    pub args_hash: Field,

    // The hash of the return values from this function call.
    pub returns_hash: Field,

    // Header of a block whose state is used during the private execution.
    // @dev: It's not the block the transaction is included in. And it doesn't have to be the block immediately before
    //       the block the transaction is included in.
    pub anchor_block_header: BlockHeader,

    // The context of the transaction that is being executed.
    // Note: The chain_id and version here are not redundant to the values in self.anchor_block_header.global_variables.
    // They can be different in case of a protocol upgrade. In such a situation we could be using header from a block
    // before the upgrade took place but be using the updated protocol to execute and prove the transaction.
    pub tx_context: TxContext,

    // The counter after which all side effects are non-revertible.
    // @dev: This can only be set at most once during the private execution.
    pub min_revertible_side_effect_counter: u32,

    // Whether the contract of this function call is the fee payer.
    // @dev: This must be set once and only once during the private execution.
    pub is_fee_payer: bool,

    // The timestamp by which the tx must be included in a block.
    pub include_by_timestamp: u64,

    // The side effect counter at the start of this function call.
    // All counted items emitted from this function call must have a counter greater than this value.
    pub start_side_effect_counter: u32,
    // The side effect counter at the end of this function call.
    // All counted items emitted from this function call must have a counter less than this value.
    pub end_side_effect_counter: u32,

    ///////////////////////////////////
    // Validation Requests

    // A counter that the app circuit expects to be non-revertible.
    // @dev: The app circuit should set this to the **largest** non-revertible counter it has observed during the
    //       function call. Set it to 0 if the validation is not required.
    pub expected_non_revertible_side_effect_counter: u32,
    // A counter that the app circuit expects to be revertible.
    // @dev: The app circuit should set this to the **smallest** revertible counter it has observed during the function
    //       call. Set it to 0 if the validation is not required.
    pub expected_revertible_side_effect_counter: u32,
    // Requests for the kernel circuit to validate the note hashes being read in this function call.
    pub note_hash_read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    // Requests for the kernel circuit to validate the nullifiers being read in this function call.
    pub nullifier_read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    // Requests for the kernel circuit to validate the keys being used in this function call.
    pub key_validation_requests_and_generators: ClaimedLengthArray<KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL>,

    ///////////////////////////////////
    // Call Requests

    // The private calls made in this function call.
    pub private_call_requests: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    // The public calls made in this function call.
    pub public_call_requests: ClaimedLengthArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_CALL>,
    // The public teardown call request.
    // @dev: This can only be set at most once during the private execution.
    pub public_teardown_call_request: PublicCallRequest,

    ///////////////////////////////////
    // Tx Effects

    // The note hashes created in this function call.
    pub note_hashes: ClaimedLengthArray<Counted<NoteHash>, MAX_NOTE_HASHES_PER_CALL>,
    // The nullifiers created in this function call.
    pub nullifiers: ClaimedLengthArray<Counted<Nullifier>, MAX_NULLIFIERS_PER_CALL>,
    // The L2 to L1 messages created in this function call.
    pub l2_to_l1_msgs: ClaimedLengthArray<Counted<L2ToL1Message>, MAX_L2_TO_L1_MSGS_PER_CALL>,
    // The private logs created in this function call.
    pub private_logs: ClaimedLengthArray<Counted<PrivateLogData>, MAX_PRIVATE_LOGS_PER_CALL>,
    // The hashes of the contract class logs created in this function call.
    pub contract_class_logs_hashes: ClaimedLengthArray<Counted<LogHash>, MAX_CONTRACT_CLASS_LOGS_PER_CALL>,
}

impl Empty for PrivateCircuitPublicInputs {
    fn empty() -> Self {
        PrivateCircuitPublicInputs {
            call_context: CallContext::empty(),
            args_hash: 0,
            returns_hash: 0,
            min_revertible_side_effect_counter: 0,
            is_fee_payer: false,
            include_by_timestamp: 0,
            note_hash_read_requests: ClaimedLengthArray::empty(),
            nullifier_read_requests: ClaimedLengthArray::empty(),
            key_validation_requests_and_generators: ClaimedLengthArray::empty(),
            note_hashes: ClaimedLengthArray::empty(),
            nullifiers: ClaimedLengthArray::empty(),
            private_call_requests: ClaimedLengthArray::empty(),
            public_call_requests: ClaimedLengthArray::empty(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: ClaimedLengthArray::empty(),
            private_logs: ClaimedLengthArray::empty(),
            contract_class_logs_hashes: ClaimedLengthArray::empty(),
            start_side_effect_counter: 0,
            end_side_effect_counter: 0,
            expected_non_revertible_side_effect_counter: 0,
            expected_revertible_side_effect_counter: 0,
            anchor_block_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
        }
    }
}

#[test]
fn test_private_circuit_public_inputs_serialization() {
    let item = PrivateCircuitPublicInputs::empty();
    // We use the PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant
    let serialized: [Field; PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH] = item.serialize();
    let deserialized = PrivateCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}

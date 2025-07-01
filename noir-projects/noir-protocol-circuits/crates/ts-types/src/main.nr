use dep::types::{
    abis::{
        log_hash::LogHash,
        note_hash::{NoteHash, ScopedNoteHash},
        nullifier::{Nullifier, ScopedNullifier},
        private_call_request::PrivateCallRequest,
        private_log::PrivateLogData,
        public_call_request::PublicCallRequest,
        read_request::{ReadRequest, ScopedReadRequest},
        side_effect::Counted,
        validation_requests::{
            key_validation_request_and_generator::KeyValidationRequestAndGenerator,
            scoped_key_validation_request_and_generator::ScopedKeyValidationRequestAndGenerator,
        },
    },
    messaging::l2_to_l1_message::L2ToL1Message,
};

// This is a temporary workaround to make the noir codegen generate the ts type definitions for the following structs.
// Remove this file once this issue is fixed: https://github.com/noir-lang/noir/issues/9026
fn main(
    note_hash: NoteHash,
    scoped_note_hash: ScopedNoteHash,
    nullifier: Nullifier,
    scoped_nullifier: ScopedNullifier,
    private_log_data: PrivateLogData,
    log_hash: LogHash,
    private_call_request: PrivateCallRequest,
    public_call_request: PublicCallRequest,
    read_request: ReadRequest,
    scoped_read_request: ScopedReadRequest,
    key_validation_request: KeyValidationRequestAndGenerator,
    scoped_key_validation_request: ScopedKeyValidationRequestAndGenerator,
    l2_to_l1_message: L2ToL1Message,
    counted: Counted<u32>,
) -> pub u32 {
    0
}

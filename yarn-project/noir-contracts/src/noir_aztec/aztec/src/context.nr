use crate::abi;
use crate::types::vec::BoundedVec;

struct Context {
    // args : BoundedVec<Field, abi::MAX_ARGS>,
    // return_values : BoundedVec<Field, abi::MAX_RETURN_VALUES>,

    read_requests: BoundedVec<Field, abi::MAX_READ_REQUESTS>,

    new_note_hashes: BoundedVec<Field, abi::MAX_NEW_NOTE_HASHES>,
    new_nullifiers: BoundedVec<Field, abi::MAX_NEW_NULLIFIERS>,

    // private_call_stack : BoundedVec<Field, abi::MAX_PRIVATE_CALL_STACK>,
    // public_call_stack : BoundedVec<Field, abi::MAX_PUBLIC_CALL_STACK>,
    // new_l2_to_l1_msgs : BoundedVec<Field, abi::MAX_L2_TO_L1_MSGS>,

    encrypted_logs_hash: [Field; 2],
    encrypted_log_preimages_length: Field,
    unencrypted_logs_hash: [Field; 2],
    unencrypted_log_preimages_length: Field,
}

impl Context {
    fn new() -> Self {
        Context {
            // inputs: inputs,
            // args: BoundedVec::new(0),
            // return_values: BoundedVec::new(0),

            read_requests: BoundedVec::new(0),

            new_note_hashes: BoundedVec::new(0),
            new_nullifiers: BoundedVec::new(0),

            // private_call_stack: BoundedVec::new(0),
            // public_call_stack: BoundedVec::new(0),
            // new_l2_to_l1_msgs: BoundedVec::new(0),

            encrypted_logs_hash: [0; 2],
            encrypted_log_preimages_length: 0,
            unencrypted_logs_hash: [0; 2],
            unencrypted_log_preimages_length: 0,
        }
    }

    fn push_read_request(mut self: Self, read_request: Field) -> Self {
        self.read_requests = self.read_requests.push(read_request);
        self
    }

    fn push_new_note_hash(mut self: Self, note_hash: Field) -> Self {
        self.new_note_hashes = self.new_note_hashes.push(note_hash);
        self
    }

    fn push_new_nullifier(mut self: Self, nullifier: Field) -> Self {
        self.new_nullifiers = self.new_nullifiers.push(nullifier);
        self
    }

    fn set_encrypted_logs_hash(mut self: Self, hash: [Field; 2]) -> Self {
        self.encrypted_logs_hash = hash;
        self
    }

    fn set_encrypted_log_preimages_length(mut self: Self, len: Field) -> Self {
        self.encrypted_log_preimages_length = len;
        self
    }

    fn set_unencrypted_logs_hash(mut self: Self, hash: [Field; 2]) -> Self {
        self.unencrypted_logs_hash = hash;
        self
    }

    fn set_unencrypted_log_preimages_length(mut self: Self, len: Field) -> Self {
        self.unencrypted_log_preimages_length = len;
        self
    }
}
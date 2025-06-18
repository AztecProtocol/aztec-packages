use protocol_types::hash::poseidon2_hash_bytes;

pub global PRIVATE_NOTE_MSG_TYPE_ID: u64 = 0;
pub global PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID: u64 = 1;
pub global PRIVATE_EVENT_MSG_TYPE_ID: u64 = 2;

pub global OFFCHAIN_MESSAGE_IDENTIFIER: Field =
    comptime { poseidon2_hash_bytes("aztecnr_offchain_message".as_bytes()) };

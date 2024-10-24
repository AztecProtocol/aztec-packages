use crate::{
    abis::{
        gas::Gas,
        log_hash::{LogHash, ScopedLogHash},
        note_hash::ScopedNoteHash,
        nullifier::Nullifier,
        public_call_request::PublicCallRequest,
        public_data_update_request::PublicDataUpdateRequest,
    },
    constants::{
        MAX_ENCRYPTED_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX,
        NUM_PUBLIC_ACCUMULATED_DATA_ARRAYS, PUBLIC_ACCUMULATED_DATA_LENGTH,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_length, reader::Reader},
};

pub struct PublicAccumulatedData {
    note_hashes: [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX],
    nullifiers: [Nullifier; MAX_NULLIFIERS_PER_TX],
    l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_L2_TO_L1_MSGS_PER_TX],

    note_encrypted_logs_hashes: [LogHash; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    encrypted_logs_hashes: [ScopedLogHash; MAX_ENCRYPTED_LOGS_PER_TX],
    unencrypted_logs_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],

    public_data_update_requests: [PublicDataUpdateRequest; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],

    public_call_stack: [PublicCallRequest; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],

    gas_used: Gas,
}

impl Empty for PublicAccumulatedData {
    fn empty() -> Self {
        PublicAccumulatedData {
            note_hashes: [ScopedNoteHash::empty(); MAX_NOTE_HASHES_PER_TX],
            nullifiers: [Nullifier::empty(); MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            note_encrypted_logs_hashes: [LogHash::empty(); MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
            encrypted_logs_hashes: [ScopedLogHash::empty(); MAX_ENCRYPTED_LOGS_PER_TX],
            unencrypted_logs_hashes: [ScopedLogHash::empty(); MAX_UNENCRYPTED_LOGS_PER_TX],
            public_data_update_requests: [
                PublicDataUpdateRequest::empty(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ],
            public_call_stack: [PublicCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
            gas_used: Gas::empty(),
        }
    }
}

impl Serialize<PUBLIC_ACCUMULATED_DATA_LENGTH> for PublicAccumulatedData {
    fn serialize(self) -> [Field; PUBLIC_ACCUMULATED_DATA_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_ACCUMULATED_DATA_LENGTH> = BoundedVec::new();

        for i in 0..MAX_NOTE_HASHES_PER_TX {
            fields.extend_from_array(self.note_hashes[i].serialize());
        }

        for i in 0..MAX_NULLIFIERS_PER_TX {
            fields.extend_from_array(self.nullifiers[i].serialize());
        }

        for i in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            fields.extend_from_array(self.l2_to_l1_msgs[i].serialize());
        }

        for i in 0..MAX_NOTE_ENCRYPTED_LOGS_PER_TX {
            fields.extend_from_array(self.note_encrypted_logs_hashes[i].serialize());
        }

        for i in 0..MAX_ENCRYPTED_LOGS_PER_TX {
            fields.extend_from_array(self.encrypted_logs_hashes[i].serialize());
        }

        for i in 0..MAX_UNENCRYPTED_LOGS_PER_TX {
            fields.extend_from_array(self.unencrypted_logs_hashes[i].serialize());
        }

        for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            fields.extend_from_array(self.public_data_update_requests[i].serialize());
        }

        for i in 0..MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX {
            fields.extend_from_array(self.public_call_stack[i].serialize());
        }

        fields.extend_from_array(self.gas_used.serialize());

        assert_eq(fields.len(), PUBLIC_ACCUMULATED_DATA_LENGTH);

        fields.storage
    }
}

impl Deserialize<PUBLIC_ACCUMULATED_DATA_LENGTH> for PublicAccumulatedData {
    fn deserialize(fields: [Field; PUBLIC_ACCUMULATED_DATA_LENGTH]) -> PublicAccumulatedData {
        let mut reader = Reader::new(fields);

        let item = PublicAccumulatedData {
            note_hashes: reader.read_struct_array(
                ScopedNoteHash::deserialize,
                [ScopedNoteHash::empty(); MAX_NOTE_HASHES_PER_TX],
            ),
            nullifiers: reader.read_struct_array(
                Nullifier::deserialize,
                [Nullifier::empty(); MAX_NULLIFIERS_PER_TX],
            ),
            l2_to_l1_msgs: reader.read_struct_array(
                ScopedL2ToL1Message::deserialize,
                [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            ),
            note_encrypted_logs_hashes: reader.read_struct_array(
                LogHash::deserialize,
                [LogHash::empty(); MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
            ),
            encrypted_logs_hashes: reader.read_struct_array(
                ScopedLogHash::deserialize,
                [ScopedLogHash::empty(); MAX_ENCRYPTED_LOGS_PER_TX],
            ),
            unencrypted_logs_hashes: reader.read_struct_array(
                ScopedLogHash::deserialize,
                [ScopedLogHash::empty(); MAX_UNENCRYPTED_LOGS_PER_TX],
            ),
            public_data_update_requests: reader.read_struct_array(
                PublicDataUpdateRequest::deserialize,
                [PublicDataUpdateRequest::empty(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
            ),
            public_call_stack: reader.read_struct_array(
                PublicCallRequest::deserialize,
                [PublicCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
            ),
            gas_used: reader.read_struct(Gas::deserialize),
        };
        reader.finish();
        item
    }
}

impl Eq for PublicAccumulatedData {
    fn eq(self, other: Self) -> bool {
        (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.note_encrypted_logs_hashes == other.note_encrypted_logs_hashes)
            & (self.encrypted_logs_hashes == other.encrypted_logs_hashes)
            & (self.unencrypted_logs_hashes == other.unencrypted_logs_hashes)
            & (self.public_data_update_requests == other.public_data_update_requests)
            & (self.public_call_stack == other.public_call_stack)
            & (self.gas_used == other.gas_used)
    }
}

pub struct PublicAccumulatedDataArrayLengths {
    note_hashes: u32,
    nullifiers: u32,
    l2_to_l1_msgs: u32,
    note_encrypted_logs_hashes: u32,
    encrypted_logs_hashes: u32,
    unencrypted_logs_hashes: u32,
    public_data_update_requests: u32,
    public_call_stack: u32,
}

impl PublicAccumulatedDataArrayLengths {
    pub fn new(data: PublicAccumulatedData) -> Self {
        PublicAccumulatedDataArrayLengths {
            note_hashes: array_length(data.note_hashes),
            nullifiers: array_length(data.nullifiers),
            l2_to_l1_msgs: array_length(data.l2_to_l1_msgs),
            note_encrypted_logs_hashes: array_length(data.note_encrypted_logs_hashes),
            encrypted_logs_hashes: array_length(data.encrypted_logs_hashes),
            unencrypted_logs_hashes: array_length(data.unencrypted_logs_hashes),
            public_data_update_requests: array_length(data.public_data_update_requests),
            public_call_stack: array_length(data.public_call_stack),
        }
    }
}

impl Empty for PublicAccumulatedDataArrayLengths {
    fn empty() -> Self {
        PublicAccumulatedDataArrayLengths {
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            note_encrypted_logs_hashes: 0,
            encrypted_logs_hashes: 0,
            unencrypted_logs_hashes: 0,
            public_data_update_requests: 0,
            public_call_stack: 0,
        }
    }
}

impl Eq for PublicAccumulatedDataArrayLengths {
    fn eq(self, other: Self) -> bool {
        (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.note_encrypted_logs_hashes == other.note_encrypted_logs_hashes)
            & (self.encrypted_logs_hashes == other.encrypted_logs_hashes)
            & (self.unencrypted_logs_hashes == other.unencrypted_logs_hashes)
            & (self.public_data_update_requests == other.public_data_update_requests)
            & (self.public_call_stack == other.public_call_stack)
    }
}

impl Serialize<NUM_PUBLIC_ACCUMULATED_DATA_ARRAYS> for PublicAccumulatedDataArrayLengths {
    fn serialize(self) -> [Field; NUM_PUBLIC_ACCUMULATED_DATA_ARRAYS] {
        let mut fields: BoundedVec<Field, NUM_PUBLIC_ACCUMULATED_DATA_ARRAYS> = BoundedVec::new();

        fields.push(self.note_hashes as Field);
        fields.push(self.nullifiers as Field);
        fields.push(self.l2_to_l1_msgs as Field);
        fields.push(self.note_encrypted_logs_hashes as Field);
        fields.push(self.encrypted_logs_hashes as Field);
        fields.push(self.unencrypted_logs_hashes as Field);
        fields.push(self.public_data_update_requests as Field);
        fields.push(self.public_call_stack as Field);

        fields.storage
    }
}

impl Deserialize<NUM_PUBLIC_ACCUMULATED_DATA_ARRAYS> for PublicAccumulatedDataArrayLengths {
    fn deserialize(
        fields: [Field; NUM_PUBLIC_ACCUMULATED_DATA_ARRAYS],
    ) -> PublicAccumulatedDataArrayLengths {
        let mut reader = Reader::new(fields);

        let item = Self {
            note_hashes: reader.read_u32(),
            nullifiers: reader.read_u32(),
            l2_to_l1_msgs: reader.read_u32(),
            note_encrypted_logs_hashes: reader.read_u32(),
            encrypted_logs_hashes: reader.read_u32(),
            unencrypted_logs_hashes: reader.read_u32(),
            public_data_update_requests: reader.read_u32(),
            public_call_stack: reader.read_u32(),
        };

        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicAccumulatedData::empty();
    let serialized = item.serialize();
    let deserialized = PublicAccumulatedData::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn serialization_of_empty_array_lengths() {
    let item = PublicAccumulatedDataArrayLengths::empty();
    let serialized = item.serialize();
    let deserialized = PublicAccumulatedDataArrayLengths::deserialize(serialized);
    assert(item.eq(deserialized));
}

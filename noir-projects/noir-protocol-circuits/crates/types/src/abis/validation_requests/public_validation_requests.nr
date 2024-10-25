use crate::{
    abis::{
        public_data_read::PublicDataRead, read_request::ScopedReadRequest,
        tree_leaf_read_request::TreeLeafReadRequest,
        validation_requests::rollup_validation_requests::RollupValidationRequests,
    },
    constants::{
        MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        MAX_PUBLIC_DATA_READS_PER_TX, NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS,
        PUBLIC_VALIDATION_REQUESTS_LENGTH,
    },
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_length, reader::Reader},
};

pub struct PublicValidationRequests {
    for_rollup: RollupValidationRequests,
    note_hash_read_requests: [TreeLeafReadRequest; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    nullifier_read_requests: [ScopedReadRequest; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    nullifier_non_existent_read_requests: [ScopedReadRequest; MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX],
    l1_to_l2_msg_read_requests: [TreeLeafReadRequest; MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX],
    public_data_reads: [PublicDataRead; MAX_PUBLIC_DATA_READS_PER_TX],
}

impl Serialize<PUBLIC_VALIDATION_REQUESTS_LENGTH> for PublicValidationRequests {
    fn serialize(self) -> [Field; PUBLIC_VALIDATION_REQUESTS_LENGTH] {
        let mut fields: BoundedVec<Field, PUBLIC_VALIDATION_REQUESTS_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.for_rollup.serialize());

        for i in 0..self.note_hash_read_requests.len() {
            fields.extend_from_array(self.note_hash_read_requests[i].serialize());
        }

        for i in 0..self.nullifier_read_requests.len() {
            fields.extend_from_array(self.nullifier_read_requests[i].serialize());
        }

        for i in 0..self.nullifier_non_existent_read_requests.len() {
            fields.extend_from_array(self.nullifier_non_existent_read_requests[i].serialize());
        }

        for i in 0..self.l1_to_l2_msg_read_requests.len() {
            fields.extend_from_array(self.l1_to_l2_msg_read_requests[i].serialize());
        }

        for i in 0..self.public_data_reads.len() {
            fields.extend_from_array(self.public_data_reads[i].serialize());
        }

        assert_eq(fields.len(), PUBLIC_VALIDATION_REQUESTS_LENGTH);

        fields.storage
    }
}

impl Deserialize<PUBLIC_VALIDATION_REQUESTS_LENGTH> for PublicValidationRequests {
    fn deserialize(serialized: [Field; PUBLIC_VALIDATION_REQUESTS_LENGTH]) -> Self {
        // TODO(#4390): This should accept a reader ^ to avoid copying data.
        let mut reader = Reader::new(serialized);
        let item = Self {
            for_rollup: reader.read_struct(RollupValidationRequests::deserialize),
            note_hash_read_requests: reader.read_struct_array(
                TreeLeafReadRequest::deserialize,
                [TreeLeafReadRequest::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
            ),
            nullifier_read_requests: reader.read_struct_array(
                ScopedReadRequest::deserialize,
                [ScopedReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX],
            ),
            nullifier_non_existent_read_requests: reader.read_struct_array(
                ScopedReadRequest::deserialize,
                [ScopedReadRequest::empty(); MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX],
            ),
            l1_to_l2_msg_read_requests: reader.read_struct_array(
                TreeLeafReadRequest::deserialize,
                [TreeLeafReadRequest::empty(); MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX],
            ),
            public_data_reads: reader.read_struct_array(
                PublicDataRead::deserialize,
                [PublicDataRead::empty(); MAX_PUBLIC_DATA_READS_PER_TX],
            ),
        };

        reader.finish();
        item
    }
}

impl Empty for PublicValidationRequests {
    fn empty() -> Self {
        PublicValidationRequests {
            for_rollup: RollupValidationRequests::empty(),
            note_hash_read_requests: [
                TreeLeafReadRequest::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_TX
            ],
            nullifier_read_requests: [
                ScopedReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX
            ],
            nullifier_non_existent_read_requests: [
                ScopedReadRequest::empty(); MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX
            ],
            l1_to_l2_msg_read_requests: [
                TreeLeafReadRequest::empty(); MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX
            ],
            public_data_reads: [PublicDataRead::empty(); MAX_PUBLIC_DATA_READS_PER_TX],
        }
    }
}

impl Eq for PublicValidationRequests {
    fn eq(self, other: Self) -> bool {
        (self.for_rollup.eq(other.for_rollup))
            & (self.note_hash_read_requests == other.note_hash_read_requests)
            & (self.nullifier_read_requests == other.nullifier_read_requests)
            & (
                self.nullifier_non_existent_read_requests
                    == other.nullifier_non_existent_read_requests
            )
            & (self.l1_to_l2_msg_read_requests == other.l1_to_l2_msg_read_requests)
            & (self.public_data_reads == other.public_data_reads)
    }
}

pub struct PublicValidationRequestArrayLengths {
    note_hash_read_requests: u32,
    nullifier_read_requests: u32,
    nullifier_non_existent_read_requests: u32,
    l1_to_l2_msg_read_requests: u32,
    public_data_reads: u32,
}

impl PublicValidationRequestArrayLengths {
    pub fn new(requests: PublicValidationRequests) -> Self {
        PublicValidationRequestArrayLengths {
            note_hash_read_requests: array_length(requests.note_hash_read_requests),
            nullifier_read_requests: array_length(requests.nullifier_read_requests),
            nullifier_non_existent_read_requests: array_length(
                requests.nullifier_non_existent_read_requests,
            ),
            l1_to_l2_msg_read_requests: array_length(requests.l1_to_l2_msg_read_requests),
            public_data_reads: array_length(requests.public_data_reads),
        }
    }
}

impl Empty for PublicValidationRequestArrayLengths {
    fn empty() -> Self {
        PublicValidationRequestArrayLengths {
            note_hash_read_requests: 0,
            nullifier_read_requests: 0,
            nullifier_non_existent_read_requests: 0,
            l1_to_l2_msg_read_requests: 0,
            public_data_reads: 0,
        }
    }
}

impl Eq for PublicValidationRequestArrayLengths {
    fn eq(self, other: Self) -> bool {
        (self.note_hash_read_requests == other.note_hash_read_requests)
            & (self.nullifier_read_requests == other.nullifier_read_requests)
            & (
                self.nullifier_non_existent_read_requests
                    == other.nullifier_non_existent_read_requests
            )
            & (self.l1_to_l2_msg_read_requests == other.l1_to_l2_msg_read_requests)
            & (self.public_data_reads == other.public_data_reads)
    }
}

impl Serialize<NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS> for PublicValidationRequestArrayLengths {
    fn serialize(self) -> [Field; NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS] {
        let mut fields: BoundedVec<Field, NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS> = BoundedVec::new();

        fields.push(self.note_hash_read_requests as Field);
        fields.push(self.nullifier_read_requests as Field);
        fields.push(self.nullifier_non_existent_read_requests as Field);
        fields.push(self.l1_to_l2_msg_read_requests as Field);
        fields.push(self.public_data_reads as Field);

        fields.storage
    }
}

impl Deserialize<NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS> for PublicValidationRequestArrayLengths {
    fn deserialize(serialized: [Field; NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS]) -> Self {
        let mut reader = Reader::new(serialized);
        let item = Self {
            note_hash_read_requests: reader.read_u32(),
            nullifier_read_requests: reader.read_u32(),
            nullifier_non_existent_read_requests: reader.read_u32(),
            l1_to_l2_msg_read_requests: reader.read_u32(),
            public_data_reads: reader.read_u32(),
        };
        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicValidationRequests::empty();
    let serialized = item.serialize();
    let deserialized = PublicValidationRequests::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn serialization_of_empty_array_lengths() {
    let item = PublicValidationRequestArrayLengths::empty();
    let serialized = item.serialize();
    let deserialized = PublicValidationRequestArrayLengths::deserialize(serialized);
    assert(item.eq(deserialized));
}

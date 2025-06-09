use crate::{
    abis::{public_data_write::PublicDataWrite, public_log::PublicLog, side_effect::scoped::Scoped},
    constants::{
        AVM_ACCUMULATED_DATA_LENGTH, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        NUM_AVM_ACCUMULATED_DATA_ARRAYS,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_length, reader::Reader},
};

pub struct AvmAccumulatedData {
    // The note hashes from private combining with those made in the AVM execution.
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    // The nullifiers from private combining with those made in the AVM execution.
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    // The L2 to L1 messages from private combining with those made in the AVM execution.
    pub l2_to_l1_msgs: [Scoped<L2ToL1Message>; MAX_L2_TO_L1_MSGS_PER_TX],
    // The public logs emitted from the AVM execution.
    pub public_logs: [PublicLog; MAX_PUBLIC_LOGS_PER_TX],
    // The public data writes made in the AVM execution.
    pub public_data_writes: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
}

impl Empty for AvmAccumulatedData {
    fn empty() -> Self {
        AvmAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            public_logs: [PublicLog::empty(); MAX_PUBLIC_LOGS_PER_TX],
            public_data_writes: [
                PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ],
        }
    }
}

impl Serialize<AVM_ACCUMULATED_DATA_LENGTH> for AvmAccumulatedData {
    fn serialize(self) -> [Field; AVM_ACCUMULATED_DATA_LENGTH] {
        let mut fields: BoundedVec<Field, AVM_ACCUMULATED_DATA_LENGTH> = BoundedVec::new();

        for i in 0..self.note_hashes.len() {
            fields.extend_from_array(self.note_hashes[i].serialize());
        }

        for i in 0..self.nullifiers.len() {
            fields.extend_from_array(self.nullifiers[i].serialize());
        }

        for i in 0..self.l2_to_l1_msgs.len() {
            fields.extend_from_array(self.l2_to_l1_msgs[i].serialize());
        }

        for i in 0..self.public_logs.len() {
            fields.extend_from_array(self.public_logs[i].serialize());
        }

        for i in 0..self.public_data_writes.len() {
            fields.extend_from_array(self.public_data_writes[i].serialize());
        }

        assert_eq(fields.len(), AVM_ACCUMULATED_DATA_LENGTH);

        fields.storage()
    }
}

impl Deserialize<AVM_ACCUMULATED_DATA_LENGTH> for AvmAccumulatedData {
    fn deserialize(fields: [Field; AVM_ACCUMULATED_DATA_LENGTH]) -> AvmAccumulatedData {
        let mut reader = Reader::new(fields);

        let item = AvmAccumulatedData {
            note_hashes: reader.read_array(),
            nullifiers: reader.read_array(),
            l2_to_l1_msgs: reader.read_struct_array(
                Scoped::deserialize,
                [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            ),
            public_logs: reader.read_struct_array(
                PublicLog::deserialize,
                [PublicLog::empty(); MAX_PUBLIC_LOGS_PER_TX],
            ),
            public_data_writes: reader.read_struct_array(
                PublicDataWrite::deserialize,
                [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
            ),
        };
        reader.finish();
        item
    }
}

impl Eq for AvmAccumulatedData {
    fn eq(self, other: Self) -> bool {
        (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.public_logs == other.public_logs)
            & (self.public_data_writes == other.public_data_writes)
    }
}

pub struct AvmAccumulatedDataArrayLengths {
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
    pub public_logs: u32,
    pub public_data_writes: u32,
}

impl AvmAccumulatedDataArrayLengths {
    pub fn new(data: AvmAccumulatedData) -> Self {
        AvmAccumulatedDataArrayLengths {
            note_hashes: array_length(data.note_hashes),
            nullifiers: array_length(data.nullifiers),
            l2_to_l1_msgs: array_length(data.l2_to_l1_msgs),
            public_logs: array_length(data.public_logs),
            public_data_writes: array_length(data.public_data_writes),
        }
    }
}

impl Empty for AvmAccumulatedDataArrayLengths {
    fn empty() -> Self {
        AvmAccumulatedDataArrayLengths {
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_logs: 0,
            public_data_writes: 0,
        }
    }
}

impl Eq for AvmAccumulatedDataArrayLengths {
    fn eq(self, other: Self) -> bool {
        (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.public_logs == other.public_logs)
            & (self.public_data_writes == other.public_data_writes)
    }
}

impl Serialize<NUM_AVM_ACCUMULATED_DATA_ARRAYS> for AvmAccumulatedDataArrayLengths {
    fn serialize(self) -> [Field; NUM_AVM_ACCUMULATED_DATA_ARRAYS] {
        let mut fields: BoundedVec<Field, NUM_AVM_ACCUMULATED_DATA_ARRAYS> = BoundedVec::new();

        fields.push(self.note_hashes as Field);
        fields.push(self.nullifiers as Field);
        fields.push(self.l2_to_l1_msgs as Field);
        fields.push(self.public_logs as Field);
        fields.push(self.public_data_writes as Field);

        fields.storage()
    }
}

impl Deserialize<NUM_AVM_ACCUMULATED_DATA_ARRAYS> for AvmAccumulatedDataArrayLengths {
    fn deserialize(
        fields: [Field; NUM_AVM_ACCUMULATED_DATA_ARRAYS],
    ) -> AvmAccumulatedDataArrayLengths {
        let mut reader = Reader::new(fields);

        let item = Self {
            note_hashes: reader.read_u32(),
            nullifiers: reader.read_u32(),
            l2_to_l1_msgs: reader.read_u32(),
            public_logs: reader.read_u32(),
            public_data_writes: reader.read_u32(),
        };

        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty_avm_accumulated_data() {
    let item = AvmAccumulatedData::empty();
    let serialized = item.serialize();
    let deserialized = AvmAccumulatedData::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn serialization_of_empty_avm_accumulated_data_array_lengths() {
    let item = AvmAccumulatedDataArrayLengths::empty();
    let serialized = item.serialize();
    let deserialized = AvmAccumulatedDataArrayLengths::deserialize(serialized);
    assert(item.eq(deserialized));
}

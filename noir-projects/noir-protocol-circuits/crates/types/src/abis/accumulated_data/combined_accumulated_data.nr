use crate::{
    abis::{log_hash::ScopedLogHash, private_log::PrivateLog, public_data_write::PublicDataWrite},
    constants::{
        COMBINED_ACCUMULATED_DATA_LENGTH, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct CombinedAccumulatedData {
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_L2_TO_L1_MSGS_PER_TX],

    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub unencrypted_logs_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
    pub contract_class_logs_hashes: [ScopedLogHash; MAX_CONTRACT_CLASS_LOGS_PER_TX],

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    pub unencrypted_log_preimages_length: Field,
    pub contract_class_log_preimages_length: Field,

    pub public_data_writes: [PublicDataWrite; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
}

impl Empty for CombinedAccumulatedData {
    fn empty() -> Self {
        CombinedAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            unencrypted_logs_hashes: [ScopedLogHash::empty(); MAX_UNENCRYPTED_LOGS_PER_TX],
            contract_class_logs_hashes: [ScopedLogHash::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
            unencrypted_log_preimages_length: 0,
            contract_class_log_preimages_length: 0,
            public_data_writes: [PublicDataWrite::empty(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
        }
    }
}

impl Serialize<COMBINED_ACCUMULATED_DATA_LENGTH> for CombinedAccumulatedData {
    fn serialize(self) -> [Field; COMBINED_ACCUMULATED_DATA_LENGTH] {
        let mut fields: BoundedVec<Field, COMBINED_ACCUMULATED_DATA_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.note_hashes);
        fields.extend_from_array(self.nullifiers);
        for i in 0..self.l2_to_l1_msgs.len() {
            fields.extend_from_array(self.l2_to_l1_msgs[i].serialize());
        }
        for i in 0..self.private_logs.len() {
            fields.extend_from_array(self.private_logs[i].serialize());
        }
        for i in 0..self.unencrypted_logs_hashes.len() {
            fields.extend_from_array(self.unencrypted_logs_hashes[i].serialize());
        }
        for i in 0..self.contract_class_logs_hashes.len() {
            fields.extend_from_array(self.contract_class_logs_hashes[i].serialize());
        }
        fields.push(self.unencrypted_log_preimages_length);
        fields.push(self.contract_class_log_preimages_length);

        for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            fields.extend_from_array(self.public_data_writes[i].serialize());
        }

        assert_eq(fields.len(), COMBINED_ACCUMULATED_DATA_LENGTH);

        fields.storage()
    }
}

impl Deserialize<COMBINED_ACCUMULATED_DATA_LENGTH> for CombinedAccumulatedData {
    fn deserialize(fields: [Field; COMBINED_ACCUMULATED_DATA_LENGTH]) -> CombinedAccumulatedData {
        let mut reader = Reader::new(fields);

        let item = CombinedAccumulatedData {
            note_hashes: reader.read_array(),
            nullifiers: reader.read_array(),
            l2_to_l1_msgs: reader.read_struct_array(
                ScopedL2ToL1Message::deserialize,
                [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            ),
            private_logs: reader.read_struct_array(
                PrivateLog::deserialize,
                [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            ),
            unencrypted_logs_hashes: reader.read_struct_array(
                ScopedLogHash::deserialize,
                [ScopedLogHash::empty(); MAX_UNENCRYPTED_LOGS_PER_TX],
            ),
            contract_class_logs_hashes: reader.read_struct_array(
                ScopedLogHash::deserialize,
                [ScopedLogHash::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
            ),
            unencrypted_log_preimages_length: reader.read(),
            contract_class_log_preimages_length: reader.read(),
            public_data_writes: reader.read_struct_array(
                PublicDataWrite::deserialize,
                [PublicDataWrite::empty(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
            ),
        };
        reader.finish();
        item
    }
}

impl Eq for CombinedAccumulatedData {
    fn eq(self, other: Self) -> bool {
        (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.private_logs == other.private_logs)
            & (self.unencrypted_logs_hashes == other.unencrypted_logs_hashes)
            & (self.contract_class_logs_hashes == other.contract_class_logs_hashes)
            & (self.unencrypted_log_preimages_length == other.unencrypted_log_preimages_length)
            & (
                self.contract_class_log_preimages_length
                    == other.contract_class_log_preimages_length
            )
            & (self.public_data_writes == other.public_data_writes)
    }
}

#[test]
fn serialization_of_empty() {
    let item = CombinedAccumulatedData::empty();
    let serialized = item.serialize();
    let deserialized = CombinedAccumulatedData::deserialize(serialized);
    assert(item.eq(deserialized));
}

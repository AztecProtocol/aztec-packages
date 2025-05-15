use crate::constants::{
    MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
    NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS, PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH,
};
use crate::{
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_length, reader::Reader},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToAvmAccumulatedData {
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_L2_TO_L1_MSGS_PER_TX],
}

impl Empty for PrivateToAvmAccumulatedData {
    fn empty() -> Self {
        PrivateToAvmAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
        }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToAvmAccumulatedDataArrayLengths {
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
}

impl PrivateToAvmAccumulatedDataArrayLengths {
    pub fn new(data: PrivateToAvmAccumulatedData) -> Self {
        PrivateToAvmAccumulatedDataArrayLengths {
            note_hashes: array_length(data.note_hashes),
            nullifiers: array_length(data.nullifiers),
            l2_to_l1_msgs: array_length(data.l2_to_l1_msgs),
        }
    }
}

impl Empty for PrivateToAvmAccumulatedDataArrayLengths {
    fn empty() -> Self {
        PrivateToAvmAccumulatedDataArrayLengths { note_hashes: 0, nullifiers: 0, l2_to_l1_msgs: 0 }
    }
}

mod test {
    use crate::{
        abis::accumulated_data::private_to_avm_accumulated_data::{
            PrivateToAvmAccumulatedData, PrivateToAvmAccumulatedDataArrayLengths,
        },
        constants::{
            NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS, PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH,
        },
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn test_empty_private_to_avm_accumulated_data() {
        let item = PrivateToAvmAccumulatedData::empty();
        let serialized: [Field; PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH] = item.serialize();
        let deserialized = PrivateToAvmAccumulatedData::deserialize(serialized);
        assert_eq(item, deserialized);
    }

    #[test]
    fn test_empty_private_to_avm_accumulated_data_array_lengths() {
        let item = PrivateToAvmAccumulatedDataArrayLengths::empty();
        let serialized: [Field; NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS] = item.serialize();
        let deserialized = PrivateToAvmAccumulatedDataArrayLengths::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}

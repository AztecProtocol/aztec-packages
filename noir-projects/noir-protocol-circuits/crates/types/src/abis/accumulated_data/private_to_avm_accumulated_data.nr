use crate::{
    abis::side_effect::scoped::Scoped,
    address::{AztecAddress, EthAddress},
    constants::{
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS, PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, FromField, Serialize},
    utils::arrays::array_length,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToAvmAccumulatedData {
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [Scoped<L2ToL1Message>; MAX_L2_TO_L1_MSGS_PER_TX],
}

impl Empty for PrivateToAvmAccumulatedData {
    fn empty() -> Self {
        PrivateToAvmAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
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

#[test]
fn serialization_of_private_to_avm_accumulated_data() {
    let mut note_hashes = [0; MAX_NOTE_HASHES_PER_TX];
    note_hashes[0] = 123;
    note_hashes[1] = 456;

    let mut nullifiers = [0; MAX_NULLIFIERS_PER_TX];
    nullifiers[0] = 789;

    let mut l2_to_l1_msgs: [Scoped<L2ToL1Message>; 8] = [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX];
    l2_to_l1_msgs[0] = L2ToL1Message { recipient: EthAddress::from_field(123), content: 456 }.scope(
        AztecAddress::from_field(789),
    );

    let item = PrivateToAvmAccumulatedData { note_hashes, nullifiers, l2_to_l1_msgs };

    // We use the PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH] = item.serialize();
    let deserialized = PrivateToAvmAccumulatedData::deserialize(serialized);
    assert_eq(item, deserialized);
}

#[test]
fn serialization_of_private_to_avm_accumulated_data_array_lengths() {
    let item =
        PrivateToAvmAccumulatedDataArrayLengths { note_hashes: 2, nullifiers: 1, l2_to_l1_msgs: 1 };
    // We use the NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS] = item.serialize();
    let deserialized = PrivateToAvmAccumulatedDataArrayLengths::deserialize(serialized);
    assert_eq(item, deserialized);
}

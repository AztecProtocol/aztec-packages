use crate::{
    abis::side_effect::Ordered,
    constants::PUBLIC_DATA_UPDATE_REQUEST_LENGTH,
    data::public_data_tree_leaf::PublicDataTreeLeaf,
    traits::{Deserialize, Empty, Serialize},
};

// TODO: Rename to PublicDataWrite
pub struct PublicDataUpdateRequest {
    pub leaf_slot: Field,
    pub new_value: Field,
    pub counter: u32,
}

impl Ordered for PublicDataUpdateRequest {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for PublicDataUpdateRequest {
    fn eq(self, update_request: PublicDataUpdateRequest) -> bool {
        (update_request.leaf_slot == self.leaf_slot) & (update_request.new_value == self.new_value)
    }
}

impl Empty for PublicDataUpdateRequest {
    fn empty() -> Self {
        Self { leaf_slot: 0, new_value: 0, counter: 0 }
    }
}

impl From<PublicDataUpdateRequest> for PublicDataTreeLeaf {
    fn from(update_request: PublicDataUpdateRequest) -> PublicDataTreeLeaf {
        PublicDataTreeLeaf { slot: update_request.leaf_slot, value: update_request.new_value }
    }
}

impl PublicDataUpdateRequest {
    pub fn is_empty(self) -> bool {
        (self.leaf_slot == 0) & (self.new_value == 0)
    }
}

impl Serialize<PUBLIC_DATA_UPDATE_REQUEST_LENGTH> for PublicDataUpdateRequest {
    fn serialize(self) -> [Field; PUBLIC_DATA_UPDATE_REQUEST_LENGTH] {
        [self.leaf_slot, self.new_value, self.counter as Field]
    }
}

impl Deserialize<PUBLIC_DATA_UPDATE_REQUEST_LENGTH> for PublicDataUpdateRequest {
    fn deserialize(fields: [Field; PUBLIC_DATA_UPDATE_REQUEST_LENGTH]) -> PublicDataUpdateRequest {
        PublicDataUpdateRequest {
            leaf_slot: fields[0],
            new_value: fields[1],
            counter: fields[2] as u32,
        }
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicDataUpdateRequest::empty();
    let serialized = item.serialize();
    let deserialized = PublicDataUpdateRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}

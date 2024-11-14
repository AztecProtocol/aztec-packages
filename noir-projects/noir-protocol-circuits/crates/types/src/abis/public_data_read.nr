use crate::{
    abis::side_effect::Ordered,
    constants::PUBLIC_DATA_READ_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};

pub struct PublicDataRead {
    pub leaf_slot: Field,
    pub value: Field,
    pub counter: u32,
}

impl Eq for PublicDataRead {
    fn eq(self, other: PublicDataRead) -> bool {
        (other.leaf_slot == self.leaf_slot)
            & (other.value == self.value)
            & (other.counter == self.counter)
    }
}

impl Empty for PublicDataRead {
    fn empty() -> Self {
        Self { leaf_slot: 0, value: 0, counter: 0 }
    }
}

impl Ordered for PublicDataRead {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl PublicDataRead {
    pub fn is_empty(self) -> bool {
        (self.leaf_slot == 0) & (self.value == 0) & (self.counter == 0)
    }
}

impl Serialize<PUBLIC_DATA_READ_LENGTH> for PublicDataRead {
    fn serialize(self) -> [Field; PUBLIC_DATA_READ_LENGTH] {
        [self.leaf_slot, self.value, self.counter as Field]
    }
}

impl Deserialize<PUBLIC_DATA_READ_LENGTH> for PublicDataRead {
    fn deserialize(fields: [Field; PUBLIC_DATA_READ_LENGTH]) -> Self {
        PublicDataRead { leaf_slot: fields[0], value: fields[1], counter: fields[2] as u32 }
    }
}

#[test]
fn serialization_of_empty() {
    let item = PublicDataRead::empty();
    let serialized = item.serialize();
    let deserialized = PublicDataRead::deserialize(serialized);
    assert(item.eq(deserialized));
}

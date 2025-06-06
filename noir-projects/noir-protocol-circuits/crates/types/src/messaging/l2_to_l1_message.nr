use crate::{
    abis::side_effect::{Counted, scoped::Scoped},
    address::{AztecAddress, EthAddress},
    constants::L2_TO_L1_MESSAGE_LENGTH,
    traits::{Deserialize, Empty, Serialize, ToField},
};

// Note: Not to be confused with L2ToL1Msg in Solidity
pub struct L2ToL1Message {
    pub recipient: EthAddress,
    pub content: Field,
}

impl Empty for L2ToL1Message {
    fn empty() -> Self {
        Self { recipient: EthAddress::empty(), content: 0 }
    }
}

impl Eq for L2ToL1Message {
    fn eq(self, other: Self) -> bool {
        (self.recipient == other.recipient) & (self.content == other.content)
    }
}

impl Serialize<L2_TO_L1_MESSAGE_LENGTH> for L2ToL1Message {
    fn serialize(self) -> [Field; L2_TO_L1_MESSAGE_LENGTH] {
        [self.recipient.to_field(), self.content]
    }
}

impl Deserialize<L2_TO_L1_MESSAGE_LENGTH> for L2ToL1Message {
    fn deserialize(values: [Field; L2_TO_L1_MESSAGE_LENGTH]) -> Self {
        Self { recipient: EthAddress::from_field(values[0]), content: values[1] }
    }
}

impl L2ToL1Message {
    pub fn count(self, counter: u32) -> Counted<L2ToL1Message> {
        Counted::new(self, counter)
    }

    pub fn scope(self, contract_address: AztecAddress) -> Scoped<L2ToL1Message> {
        Scoped::new(self, contract_address)
    }
}

impl Counted<L2ToL1Message> {
    pub fn scope(self, contract_address: AztecAddress) -> Scoped<Counted<L2ToL1Message>> {
        Scoped::new(self, contract_address)
    }
}

impl Scoped<Counted<L2ToL1Message>> {
    pub fn expose_to_public(self) -> Scoped<L2ToL1Message> {
        self.inner.inner.scope(self.contract_address)
    }
}

#[test]
fn serialization_of_empty_l2_to_l1_message() {
    let item = L2ToL1Message::empty();
    let serialized = item.serialize();
    let deserialized = L2ToL1Message::deserialize(serialized);
    assert(item.eq(deserialized));
}

use crate::{
    address::{AztecAddress, EthAddress},
    constants::{L2_TO_L1_MESSAGE_LENGTH, SCOPED_L2_TO_L1_MESSAGE_LENGTH},
    traits::{Deserialize, Empty, Serialize}, utils::{arrays::array_concat, reader::Reader}
};

// Note: Not to be confused with L2ToL1Msg in Solidity
struct L2ToL1Message {
    recipient: EthAddress,
    content: Field,
    counter: u32,
}

impl Empty for L2ToL1Message {
    fn empty() -> Self {
        Self {
            recipient: EthAddress::empty(),
            content: 0,
            counter: 0,
        }
    }
}

impl Eq for L2ToL1Message {
    fn eq(self, other: Self) -> bool {
        (self.recipient == other.recipient) & (self.content == other.content) & (self.counter == other.counter)
    }
}

impl Serialize<L2_TO_L1_MESSAGE_LENGTH> for L2ToL1Message {
    fn serialize(self) -> [Field; L2_TO_L1_MESSAGE_LENGTH] {
        [self.recipient.to_field(), self.content, self.counter as Field]
    }
}

impl Deserialize<L2_TO_L1_MESSAGE_LENGTH> for L2ToL1Message {
    fn deserialize(values: [Field; L2_TO_L1_MESSAGE_LENGTH]) -> Self {
        Self {
            recipient: EthAddress::from_field(values[0]),
            content: values[1],
            counter: values[2] as u32,
        }
    }
}

impl L2ToL1Message {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedL2ToL1Message {
        ScopedL2ToL1Message { value: self, contract_address }
    }
}

struct ScopedL2ToL1Message {
    value: L2ToL1Message,
    contract_address: AztecAddress,
}

impl Eq for ScopedL2ToL1Message {
    fn eq(self, other: ScopedL2ToL1Message) -> bool {
        (self.value == other.value)
            & (self.contract_address == other.contract_address) 
    }
}

impl Empty for ScopedL2ToL1Message {
    fn empty() -> Self {
        ScopedL2ToL1Message {
            value: L2ToL1Message::empty(),
            contract_address: AztecAddress::empty(),
        }
    }
}

impl Serialize<SCOPED_L2_TO_L1_MESSAGE_LENGTH> for ScopedL2ToL1Message {
    fn serialize(self) -> [Field; SCOPED_L2_TO_L1_MESSAGE_LENGTH] {
        array_concat(self.value.serialize(), [self.contract_address.to_field()])
    }
}

impl Deserialize<SCOPED_L2_TO_L1_MESSAGE_LENGTH> for ScopedL2ToL1Message {
    fn deserialize(values: [Field; SCOPED_L2_TO_L1_MESSAGE_LENGTH]) -> Self {
        let mut reader = Reader::new(values);
        let res = Self {
            value: reader.read_struct(L2ToL1Message::deserialize),
            contract_address: reader.read_struct(AztecAddress::deserialize),
        };
        reader.finish();
        res
    }
}

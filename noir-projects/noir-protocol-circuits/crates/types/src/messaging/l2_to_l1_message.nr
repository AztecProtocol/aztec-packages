use crate::{address::EthAddress, constants::L2_TO_L1_MESSAGE_LENGTH, traits::{Deserialize, Serialize}};

// Note: Not to be confused with L2ToL1Msg in Solidity
struct L2ToL1Message {
    recipient: EthAddress,
    content: Field,
}

impl Default for L2ToL1Message {
    fn default() -> Self {
        Self {
            recipient: EthAddress::default(),
            content: 0,
        }
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
        Self {
            recipient: EthAddress::from_field(values[0]),
            content: values[1],
        }
    }
}

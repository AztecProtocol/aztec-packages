use crate::{
    abis::side_effect::{Ordered, Scoped},
    address::{AztecAddress, EthAddress},
    constants::{L2_TO_L1_MESSAGE_LENGTH, SCOPED_L2_TO_L1_MESSAGE_LENGTH},
    traits::{Deserialize, Empty, Serialize, ToField},
    utils::{arrays::array_concat, reader::Reader},
};
use std::meta::derive;

// Note: Not to be confused with L2ToL1Msg in Solidity
#[derive(Deserialize, Eq, Serialize)]
pub struct L2ToL1Message {
    pub recipient: EthAddress,
    pub content: Field,
    pub counter: u32,
}

impl Ordered for L2ToL1Message {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Empty for L2ToL1Message {
    fn empty() -> Self {
        Self { recipient: EthAddress::empty(), content: 0, counter: 0 }
    }
}

impl L2ToL1Message {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedL2ToL1Message {
        ScopedL2ToL1Message { message: self, contract_address }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct ScopedL2ToL1Message {
    pub message: L2ToL1Message,
    pub contract_address: AztecAddress,
}

impl ScopedL2ToL1Message {
    pub fn expose_to_public(self) -> Self {
        // Hide the counter when exposing to public.
        Self {
            message: L2ToL1Message {
                recipient: self.message.recipient,
                content: self.message.content,
                counter: 0,
            },
            contract_address: self.contract_address,
        }
    }
}

impl Scoped<L2ToL1Message> for ScopedL2ToL1Message {
    fn inner(self) -> L2ToL1Message {
        self.message
    }
    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

impl Ordered for ScopedL2ToL1Message {
    fn counter(self) -> u32 {
        self.message.counter
    }
}

impl Empty for ScopedL2ToL1Message {
    fn empty() -> Self {
        ScopedL2ToL1Message {
            message: L2ToL1Message::empty(),
            contract_address: AztecAddress::empty(),
        }
    }
}

mod test {
    use crate::{
        constants::{L2_TO_L1_MESSAGE_LENGTH, SCOPED_L2_TO_L1_MESSAGE_LENGTH},
        messaging::l2_to_l1_message::{L2ToL1Message, ScopedL2ToL1Message},
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_l2() {
        let item = L2ToL1Message::empty();
        // We use the L2_TO_L1_MESSAGE_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; L2_TO_L1_MESSAGE_LENGTH] = item.serialize();
        let deserialized = L2ToL1Message::deserialize(serialized);
        assert_eq(item, deserialized);
    }

    #[test]
    fn serialization_of_empty_scoped_l2() {
        let item = ScopedL2ToL1Message::empty();
        // We use the SCOPED_L2_TO_L1_MESSAGE_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; SCOPED_L2_TO_L1_MESSAGE_LENGTH] = item.serialize();
        let deserialized = ScopedL2ToL1Message::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}

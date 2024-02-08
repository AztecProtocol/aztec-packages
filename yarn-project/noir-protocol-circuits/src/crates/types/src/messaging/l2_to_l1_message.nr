use crate::{
    address::EthAddress,
    traits::Empty,
};

struct L2ToL1Message {
    recipient: EthAddress,
    content: Field,
}

impl Empty for L2ToL1Message {
    fn empty() -> Self {
        Self {
            recipient: EthAddress::empty(),
            content: 0,
        }
    }
}

impl Eq for L2ToL1Message {
    fn eq(self, other: Self) -> bool {
        (self.recipient == other.recipient) & (self.content == other.content)
    }
}

use crate::{address::EthAddress, traits::{Deserialize, Empty, Serialize}};

#[derive(Deserialize, Eq, Serialize)]
pub struct FeeRecipient {
    pub recipient: EthAddress,
    pub value: Field,
}

impl Empty for FeeRecipient {
    fn empty() -> Self {
        Self { recipient: EthAddress::zero(), value: 0 }
    }
}

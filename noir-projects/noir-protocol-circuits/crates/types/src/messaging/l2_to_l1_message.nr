use crate::{
    abis::side_effect::{counted::Counted, scoped::Scoped},
    address::{AztecAddress, EthAddress},
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

// Note: Not to be confused with L2ToL1Msg in Solidity
#[derive(Deserialize, Eq, Serialize)]
pub struct L2ToL1Message {
    pub recipient: EthAddress,
    pub content: Field,
}

impl Empty for L2ToL1Message {
    fn empty() -> Self {
        Self { recipient: EthAddress::empty(), content: 0 }
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

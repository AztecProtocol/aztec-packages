use crate::{
    abis::side_effect::{counted::Counted, scoped::Scoped},
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct LogHash {
    pub value: Field,
    pub length: u32,
}

impl Empty for LogHash {
    fn empty() -> Self {
        LogHash { value: 0, length: 0 }
    }
}

impl LogHash {
    pub fn count(self, counter: u32) -> Counted<LogHash> {
        Counted::new(self, counter)
    }

    pub fn scope(self, contract_address: AztecAddress) -> Scoped<LogHash> {
        Scoped::new(self, contract_address)
    }
}

impl Scoped<Counted<LogHash>> {
    pub fn expose_to_public(self) -> Scoped<LogHash> {
        self.inner.inner.scope(self.contract_address)
    }
}

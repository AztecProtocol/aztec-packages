use crate::{
    abis::gas_fees::GasFees,
    address::{AztecAddress, EthAddress},
    traits::{Deserialize, Empty, Serialize},
};

// docs:start:global-variables
#[derive(Deserialize, Eq, Serialize)]
pub struct GlobalVariables {
    pub chain_id: Field,
    pub version: Field,
    pub block_number: u32,
    pub slot_number: Field,
    pub timestamp: u64,
    pub coinbase: EthAddress,
    pub fee_recipient: AztecAddress,
    pub gas_fees: GasFees,
}
// docs:end:global-variables

impl GlobalVariables {
    pub fn is_empty(self) -> bool {
        (self.chain_id == 0)
            & (self.version == 0)
            & (self.block_number == 0)
            & (self.slot_number == 0)
            & (self.timestamp == 0)
            & (self.coinbase.is_zero())
            & (self.fee_recipient.is_zero())
            & (self.gas_fees.is_empty())
    }
}

impl Empty for GlobalVariables {
    fn empty() -> Self {
        Self {
            chain_id: 0,
            version: 0,
            block_number: 0,
            slot_number: 0,
            timestamp: 0,
            coinbase: EthAddress::empty(),
            fee_recipient: AztecAddress::empty(),
            gas_fees: GasFees::empty(),
        }
    }
}

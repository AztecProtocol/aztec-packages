use dep::protocol_types::{
    address::{
        AztecAddress,
        EthAddress,
    },
    traits::Serialize,
};

// docs:start:public-global-variables
struct PublicGlobalVariables {
    chain_id: Field,
    version: Field,
    block_number: Field,
    timestamp: Field,
    coinbase: EthAddress,
    fee_recipient: AztecAddress,
}
// docs:end:public-global-variables

impl Serialize<6> for PublicGlobalVariables {
    fn serialize(self) -> [Field; 6] {
        [
            self.chain_id,
            self.version,
            self.block_number,
            self.timestamp,
            self.coinbase.to_field(),
            self.fee_recipient.to_field(),
        ]
    }
}

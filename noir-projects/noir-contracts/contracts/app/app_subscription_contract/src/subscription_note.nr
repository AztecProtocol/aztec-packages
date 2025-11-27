use aztec::{macros::notes::note, protocol_types::{address::AztecAddress, traits::Packable}};

#[derive(Eq, Packable)]
#[note]
pub struct SubscriptionNote {
    owner: AztecAddress,
    pub expiry_block_number: u32,
    pub remaining_txs: u32,
}

impl SubscriptionNote {
    pub fn new(owner: AztecAddress, expiry_block_number: u32, remaining_txs: u32) -> Self {
        Self { owner, expiry_block_number, remaining_txs }
    }
}

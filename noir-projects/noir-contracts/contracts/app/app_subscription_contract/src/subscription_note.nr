use aztec::{macros::notes::note, protocol_types::traits::Packable};

#[derive(Eq, Packable)]
#[note]
pub struct SubscriptionNote {
    pub expiry_block_number: u32,
    pub remaining_txs: u32,
}

impl SubscriptionNote {
    pub fn new(expiry_block_number: u32, remaining_txs: u32) -> Self {
        Self { expiry_block_number, remaining_txs }
    }
}

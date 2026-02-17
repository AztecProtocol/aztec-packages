use aztec::{macros::notes::note, protocol::traits::Packable};

#[derive(Eq, Packable)]
#[note]
pub struct SubscriptionNote {
    pub expiry_block_number: u32,
    pub remaining_txs: u32,
}

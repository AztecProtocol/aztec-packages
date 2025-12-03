use aztec::{macros::notes::note, protocol_types::traits::Packable};

pub trait OwnedNote {
    fn new(amount: u128) -> Self;
    fn get_amount(self) -> u128;
}

#[derive(Eq, Packable)]
#[note]
pub struct TokenNote {
    // The amount of tokens in the note
    amount: u128,
}

impl OwnedNote for TokenNote {
    fn new(amount: u128) -> Self {
        Self { amount }
    }

    fn get_amount(self) -> u128 {
        self.amount
    }
}

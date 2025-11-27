use aztec::{macros::notes::note, protocol_types::{address::AztecAddress, traits::Packable}};

pub trait OwnedNote {
    fn new(amount: u128, owner: AztecAddress) -> Self;
    fn get_amount(self) -> u128;
}
#[derive(Eq, Packable)]
#[note]
pub struct TokenNote {
    // The amount of tokens in the note
    amount: u128,
    // The owner of the note
    owner: AztecAddress,
}

impl OwnedNote for TokenNote {
    fn new(amount: u128, owner: AztecAddress) -> Self {
        Self { amount, owner }
    }

    fn get_amount(self) -> u128 {
        self.amount
    }
}

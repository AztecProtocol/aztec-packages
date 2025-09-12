use types::{
    abis::{nullifier::{Nullifier, ScopedNullifier}, transaction::tx_request::TxRequest},
    address::AztecAddress,
    traits::Hash,
};

pub fn create_protocol_nullifier(tx_request: TxRequest) -> ScopedNullifier {
    // TODO: consider using `-1` instead, for consistency with `-1` being the "null" address for msg_sender.
    Nullifier { value: tx_request.hash(), note_hash: 0, counter: 0 }.scope(AztecAddress::zero())
}

use dep::types::{
    abis::nullifier::{Nullifier, ScopedNullifier},
    address::AztecAddress,
    traits::Hash,
    transaction::tx_request::TxRequest,
};

pub fn create_protocol_nullifier(tx_request: TxRequest) -> ScopedNullifier {
    // TODO: consider using `-1` instead, for consistency with `-1` being the "null" address for msg_sender.
    Nullifier { value: tx_request.hash(), note_hash: 0, counter: 0 }.scope(AztecAddress::zero())
}

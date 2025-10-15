use types::{
    abis::{nullifier::Nullifier, transaction::tx_request::TxRequest},
    address::AztecAddress,
    side_effect::{Counted, Scoped},
    traits::Hash,
};

pub fn create_protocol_nullifier(tx_request: TxRequest) -> Scoped<Counted<Nullifier>> {
    // TODO: consider using `-1` instead, for consistency with `-1` being the "null" address for msg_sender.
    Nullifier { value: tx_request.hash(), note_hash: 0 }.count(0).scope(AztecAddress::zero())
}

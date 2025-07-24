use aztec::{
    oracle::auth_witness,
    protocol_types::{address::PartialAddress, public_keys::PublicKeys, traits::Deserialize},
};
use std::meta::derive;

#[derive(Deserialize)]
pub struct AuthWitness {
    keys: PublicKeys,
    signature: [u8; 64],
    partial_address: PartialAddress,
}

pub unconstrained fn get_auth_witness(message_hash: Field) -> AuthWitness {
    let witness: [Field; 77] = auth_witness::get_auth_witness(message_hash);
    AuthWitness::deserialize(witness)
}

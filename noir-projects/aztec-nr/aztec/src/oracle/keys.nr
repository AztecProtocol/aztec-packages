use dep::protocol_types::{
  address::{
    AztecAddress,
    PartialAddress,
    PublicKeysHash,
  }, 
  constants::{
    GENERATOR_INDEX__PUBLIC_KEYS_HASH,
    GENERATOR_INDEX__CONTRACT_ADDRESS_V1,
  },
  grumpkin_point::GrumpkinPoint,
};

use crate::hash::poseidon2_hash;

#[oracle(getPublicKeysAndPartialAddress)]
fn get_public_keys_and_partial_address_oracle(_address: AztecAddress) -> [Field; 9] {}

unconstrained fn get_public_keys_and_partial_address_oracle_wrapper(address: AztecAddress) -> [Field; 9] {
  get_public_keys_and_partial_address_oracle(address)
}

pub fn get_public_keys(address: AztecAddress) -> [GrumpkinPoint; 4] {
  let result = get_public_keys_and_partial_address_oracle_wrapper(address);

  let nullifier_pub_key = GrumpkinPoint::new(result[0], result[1]);
  let incoming_pub_key = GrumpkinPoint::new(result[2], result[3]);
  let outgoing_pub_key = GrumpkinPoint::new(result[4], result[5]);
  let tagging_pub_key = GrumpkinPoint::new(result[6], result[7]);
  let partial_address = PartialAddress::from_field(result[8]);

  let computed_address = AztecAddress::compute_from_public_keys_and_partial_address(
    nullifier_pub_key,
    incoming_pub_key,
    outgoing_pub_key,
    tagging_pub_key,
    partial_address,
  );

  assert(computed_address.eq(address));

  [nullifier_pub_key, incoming_pub_key, outgoing_pub_key, tagging_pub_key]
}

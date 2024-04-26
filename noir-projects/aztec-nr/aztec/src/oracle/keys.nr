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

pub fn get_public_keys_and_partial_address(address: AztecAddress) -> (PartialAddress, [GrumpkinPoint; 4]) {
  let result = get_public_keys_and_partial_address_oracle_wrapper(address);

  let partial_address = PartialAddress::from_field(result[0]);
  let nullifier_pub_key = GrumpkinPoint::new(result[1], result[2]);
  let incoming_pub_key = GrumpkinPoint::new(result[3], result[4]);
  let outgoing_pub_key = GrumpkinPoint::new(result[5], result[6]);
  let tagging_pub_key = GrumpkinPoint::new(result[7], result[8]);

  _check_public_key_validity_constrain_oracle(
    address,
    partial_address,
    nullifier_pub_key,
    incoming_pub_key,
    outgoing_pub_key,
    tagging_pub_key,
  );

  (partial_address, [nullifier_pub_key, incoming_pub_key, outgoing_pub_key, tagging_pub_key])
}

fn _check_public_key_validity_constrain_oracle(
  address: AztecAddress,
  partial_address: PartialAddress,
  nullifier_public_key: GrumpkinPoint,
  incoming_public_key: GrumpkinPoint,
  outgoing_public_key: GrumpkinPoint,
  tagging_public_key: GrumpkinPoint
  ) {
  let public_keys_hash = poseidon2_hash([
      nullifier_public_key.serialize()[0],
      nullifier_public_key.serialize()[1],
      incoming_public_key.serialize()[0],
      incoming_public_key.serialize()[1],
      outgoing_public_key.serialize()[0],
      outgoing_public_key.serialize()[1],
      tagging_public_key.serialize()[0],
      tagging_public_key.serialize()[1],
      GENERATOR_INDEX__PUBLIC_KEYS_HASH,
  ]);

// TODO: #5830: we can compute this like below once refactored
// let calculated_address = AztecAddress::compute(PublicKeysHash::compute(pub_key), partial_address);

  let computed_address = AztecAddress::from_field(
    poseidon2_hash([
        partial_address.to_field(),
        public_keys_hash.to_field(),
        GENERATOR_INDEX__CONTRACT_ADDRESS_V1,
    ])
  );

  assert(computed_address.eq(address));
}

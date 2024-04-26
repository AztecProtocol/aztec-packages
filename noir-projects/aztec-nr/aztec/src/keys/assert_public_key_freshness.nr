use dep::protocol_types::{
  address::{
    AztecAddress,
    PartialAddress
  }, 
  constants::{
    GENERATOR_INDEX__PUBLIC_KEYS_HASH,
    GENERATOR_INDEX__CONTRACT_ADDRESS_V1,
    CANONICAL_KEY_REGISTRY_ADDRESS
  },
  grumpkin_point::GrumpkinPoint,
};

use crate::context::PrivateContext;
use crate::hash::{
  pedersen_hash, 
  poseidon2_hash,
};
use crate::oracle;
use crate::state_vars::shared_mutable::shared_mutable_private_getter::SharedMutablePrivateGetter;

struct PublicKeyTypeEnum {
  NULLIFIER: u8,
}

global PublicKeyType = PublicKeyTypeEnum {
  NULLIFIER: 0,
};

pub fn assert_nullifier_public_key_fresh(
  context: &mut PrivateContext,
  address: AztecAddress, 
  nullifier_public_key_to_test: GrumpkinPoint,
) {
  // This is the storage slot of the nullifier_public_key inside the key registry contract
  let storage_slot_of_nullifier_public_key = 1;
  // We have to derive this slot to get the location of the shared mutable inside the Map
  // This should mimic how maps derive their slots
  let derived_slot = pedersen_hash(
    [storage_slot_of_nullifier_public_key, address.to_field()],
    0
  );

  // It's a bit wonky because we need to know the delay for get_current_value_in_private to work correctly
  // We read from the canonical Key Registry
  let registry_private_getter: SharedMutablePrivateGetter<Field, 5> = SharedMutablePrivateGetter::new(*context, AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS), derived_slot);
  let hashed_nullifier_public_key = registry_private_getter.get_current_value_in_private();

  // In the case that the value is not found in the registry we need to manually pass in the address preimage
  if (hashed_nullifier_public_key == 0) {
    check_public_key_validity(address, PublicKeyType.NULLIFIER, nullifier_public_key_to_test);
  } else {
    assert(hashed_nullifier_public_key == poseidon2_hash(nullifier_public_key_to_test.serialize()));
  }
}

fn check_public_key_validity(address: AztecAddress, key_type: u8, key: GrumpkinPoint) {
  let (partial_address, keys) = get_public_keys_and_partial_address_internal(address);

  assert(keys[key_type].eq(key));

  _check_public_key_validity_constrain_internal(
    address,
    partial_address,
    keys[0],
    keys[1],
    keys[2],
    keys[3],
  )
}

unconstrained fn get_public_keys_and_partial_address_internal(address: AztecAddress) -> (PartialAddress, [GrumpkinPoint; 4]) {
  let (partial_address, public_keys) = oracle::keys::get_public_keys_and_partial_address(address);

  (partial_address, public_keys)
}

fn _check_public_key_validity_constrain_internal(
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

  let computed_address = AztecAddress::from_field(
    poseidon2_hash([
      partial_address.to_field(),
      public_keys_hash.to_field(),
      GENERATOR_INDEX__CONTRACT_ADDRESS_V1,
    ])
  );

  assert(computed_address.eq(address));
}

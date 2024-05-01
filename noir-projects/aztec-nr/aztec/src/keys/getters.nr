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
use crate::state_vars::{
  map::derive_storage_slot_in_map,
  shared_mutable::shared_mutable_private_getter::SharedMutablePrivateGetter,
};

struct PublicKeyTypeEnum {
  NULLIFIER: u8,
}

global PublicKeyType = PublicKeyTypeEnum {
  NULLIFIER: 0,
};

pub fn get_fresh_nullifier_public_key_hash(
  context: &mut PrivateContext,
  address: AztecAddress, 
) -> Field {
  // This is the storage slot of the nullifier_public_key inside the key registry contract
  let storage_slot_of_nullifier_public_key = 1;

  let derived_slot = derive_storage_slot_in_map(storage_slot_of_nullifier_public_key, address);

  // It's a bit wonky because we need to know the delay for get_current_value_in_private to work correctly
  // We read from the canonical Key Registry
  let registry_private_getter: SharedMutablePrivateGetter<Field, 5> = SharedMutablePrivateGetter::new(*context, AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS), derived_slot);
  let nullifier_public_key_hash_in_registry = registry_private_getter.get_current_value_in_private();

  let nullifier_public_key_hash = if nullifier_public_key_hash_in_registry == 0 {
    let keys = oracle::keys::get_public_keys(address);
    poseidon2_hash(keys[PublicKeyType.NULLIFIER].serialize())
  } else {
    nullifier_public_key_hash_in_registry
  };

  nullifier_public_key_hash
}

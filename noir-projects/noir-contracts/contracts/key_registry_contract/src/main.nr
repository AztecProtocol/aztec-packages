contract KeyRegistry {
  use dep::authwit::auth::assert_current_call_valid_authwit_public;

  use dep::aztec::{
    state_vars::{
      SharedMutable,
      Map
    }, 
    protocol_types::{
      grumpkin_point::GrumpkinPoint,
      address::{
        AztecAddress,
        PublicKeysHash,
        PartialAddress,
      },
      constants::{
        GENERATOR_INDEX__CONTRACT_ADDRESS_V1,
        GENERATOR_INDEX__PUBLIC_KEYS_HASH
      },
      hash::poseidon2_hash,
    },
  };

  global KEY_ROTATION_DELAY = 5;

  #[aztec(storage)]
  struct Storage {
    // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
    // Uncomment lines below to enable that functionality
    nullifier_public_key_hash_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    // incoming_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    // outgoing_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    // tagging_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
  }

  #[aztec(public)]
  fn rotate_nullifier_public_key(
    address: AztecAddress,
    new_nullifier_public_key: GrumpkinPoint,
  ) {
    assert(
      !new_nullifier_public_key.is_zero(),
      "New nullifier public key must be non-zero"
    );

    if (!address.eq(context.msg_sender())) {
      assert_current_call_valid_authwit_public(&mut context, address);
    }

    let nullifier_key_registry = storage.nullifier_public_key_hash_registry.at(address);

    nullifier_key_registry.schedule_value_change(poseidon2_hash(new_nullifier_public_key.serialize()));
  }

  #[aztec(public)]
  fn register(
    address: AztecAddress,
    partial_address: PartialAddress,
    nullifier_public_key: GrumpkinPoint,
    incoming_public_key: GrumpkinPoint,
    outgoing_public_key: GrumpkinPoint,
    tagging_public_key: GrumpkinPoint,
  ) {
    assert(
      !partial_address.is_zero() &
      !nullifier_public_key.is_zero() &
      !incoming_public_key.is_zero() &
      !outgoing_public_key.is_zero() &
      !tagging_public_key.is_zero(),
       "All public keys must be non-zero"
    );

    // TODO (ek): Do it below after refactoring all public_keys_hash_elemtns
    // let public_keys_hash = PublicKeysHash::compute(nullifier_public_key, tagging_public_key, incoming_public_key, outgoing_public_key);
    // let address = AztecAddress::compute(public_keys_hash, partial_address);
    // We could also pass in original_public_keys_hash instead of computing it here, if all we need the original one is for being able to prove ownership of address
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
      ]
    );

    let computed_address = AztecAddress::from_field(
      poseidon2_hash([
          partial_address.to_field(),
          public_keys_hash.to_field(),
          GENERATOR_INDEX__CONTRACT_ADDRESS_V1 as Field,
        ]
      )
    );

    assert(computed_address.eq(address), "Computed address does not match supplied address");

    let nullifier_key_hash_registry = storage.nullifier_public_key_hash_registry.at(address);
    // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
    // Uncomment lines below to enable that functionality
    // let incoming_key_registry = storage.incoming_public_key_registry.at(address);
    // let outgoing_key_registry = storage.outgoing_public_key_registry.at(address);
    // let tagging_key_registry = storage.taggin_public_key_registry.at(address);

    nullifier_key_hash_registry.schedule_value_change(poseidon2_hash(nullifier_public_key.serialize()));
    // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
    // Uncomment lines below to enable that functionality    // incoming_key_registry.schedule_value_change(new_incoming_public_key);
    // outgoing_key_registry.schedule_value_change(new_outgoing_public_key);
    // tagging_key_registry.schedule_value_change(new_tagging_public_key);
  }
}

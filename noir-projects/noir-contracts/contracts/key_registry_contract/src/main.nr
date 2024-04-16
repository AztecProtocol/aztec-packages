contract KeyRegistry {
  use dep::std::hash::poseidon2::Poseidon2::hash as poseidon2_hash;
  use dep::aztec::{
    context::gas::GasOpts,
    state_vars::{
      SharedMutable,
      Map
    }, 
    protocol_types::{
      abis::function_selector::FunctionSelector,
      contract_class_id::ContractClassId,
      address::{
        AztecAddress,
        EthAddress,
        PublicKeysHash,
        PartialAddress,
      },
      constants::{
        GENERATOR_INDEX__CONTRACT_ADDRESS_V1,
        GENERATOR_INDEX__PUBLIC_KEYS_HASH
      },
      traits::{
        Serialize,
        Deserialize,
      }
    },
  };

  global KEY_ROTATION_DELAY = 5;

  #[aztec(storage)]
  struct Storage {
    // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
    // Uncomment lines below to enable that functionality
    nullifier_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    // incoming_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    // outgoing_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    // tagging_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
  }

  #[aztec(public)]
  fn register(
    address: AztecAddress,
    partial_address: PartialAddress,
    original_nullifier_public_key: Field,
    original_incoming_public_key: Field,
    original_outgoing_public_key: Field,
    original_tagging_public_key: Field,
    new_nullifier_public_key: Field,
    // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
    // Uncomment lines below to enable that functionality    // new_incoming_public_key: FIeld,
    // new_outgoing_public_key: FIeld,
    // new_tagging_public_key: FIeld,
  ) {
    assert(
      (new_nullifier_public_key != 0),
      // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
      // Uncomment lines below to enable that functionality      // (new_incoming_public_key != 0) &
      // (new_outgoing_public_key != 0) &
      // (new_tagging_public_key != 0),
       "New nullifier public key must be non-zero"
    );

    // TODO (ek): Do it below after refactoring all public_keys_hash_elemtns
    // let public_keys_hash = PublicKeysHash::compute(nullifier_public_key, tagging_public_key, incoming_public_key, outgoing_public_key);
    // let address = AztecAddress::compute(public_keys_hash, partial_address);
    // We could also pass in original_public_keys_hash instead of computing it here, if all we need the original one is for being able to prove ownership of address
    let public_keys_hash = poseidon2_hash([
        original_nullifier_public_key,
        original_incoming_public_key,
        original_outgoing_public_key,
        original_tagging_public_key,
        GENERATOR_INDEX__PUBLIC_KEYS_HASH,
      ],
      5
    );

    let computed_address = AztecAddress::from_field(
      poseidon2_hash([
          partial_address.to_field(),
          public_keys_hash.to_field(),
          GENERATOR_INDEX__CONTRACT_ADDRESS_V1 as Field,
        ],
        3
      )
    );

    assert(computed_address.eq(address), "Computed address does not match supplied address");

    let nullifier_key_registry = storage.nullifier_public_key_registry.at(address);
    // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
    // Uncomment lines below to enable that functionality
    // let incoming_key_registry = storage.incoming_public_key_registry.at(address);
    // let outgoing_key_registry = storage.outgoing_public_key_registry.at(address);
    // let tagging_key_registry = storage.taggin_public_key_registry.at(address);

    nullifier_key_registry.schedule_value_change(new_nullifier_public_key);
    // We are not supporting rotating / changing keys other than the nullifier public in the registry at the moment, but will in the future.
    // Uncomment lines below to enable that functionality    // incoming_key_registry.schedule_value_change(new_incoming_public_key);
    // outgoing_key_registry.schedule_value_change(new_outgoing_public_key);
    // tagging_key_registry.schedule_value_change(new_tagging_public_key);
  }
}

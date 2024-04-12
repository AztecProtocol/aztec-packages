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

  struct PublicKeys {
    nullifier_public_key: Field,
    incoming_public_key: Field,
    outgoing_public_key: Field,
    tagging_public_key: Field,
  }

  impl Serialize<4> for PublicKeys {
    fn serialize(self: Self) -> [Field; 4] {
        [self.nullifier_public_key, self.incoming_public_key, self.outgoing_public_key, self.tagging_public_key]
    }
  }

  impl Deserialize<4> for PublicKeys {
    fn deserialize(fields: [Field; 4]) -> Self {
        PublicKeys {
          nullifier_public_key: fields[0],
          incoming_public_key: fields[1],
          outgoing_public_key: fields[2],
          tagging_public_key: fields[3],
        }
    }
  }

  #[aztec(storage)]
  struct Storage {
    nullifier_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    incoming_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    outgoing_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    tagging_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
  }

  #[aztec(public)]
  fn register(
    address: AztecAddress,
    partial_address: PartialAddress,
    public_keys: PublicKeys,
  ) {
    let PublicKeys {
      nullifier_public_key,
      incoming_public_key,
      outgoing_public_key,
      tagging_public_key
    } = public_keys;

    assert((nullifier_public_key != 0) & (incoming_public_key != 0) & (outgoing_public_key != 0) & (tagging_public_key != 0));

    // TODO (ek): Do it below after refactoring all public_keys_hash_elemtns
    // let public_keys_hash = PublicKeysHash::compute(nullifier_public_key, tagging_public_key, incoming_public_key, outgoing_public_key);
    // let address = AztecAddress::compute(public_keys_hash, partial_address);
    let public_keys_hash = poseidon2_hash([
        nullifier_public_key,
        tagging_public_key,
        incoming_public_key,
        outgoing_public_key,
        GENERATOR_INDEX__PUBLIC_KEYS_HASH,
      ],
      5
    );

    let computed_address = AztecAddress::from_field(
      poseidon2_hash([
          public_keys_hash.to_field(),
          partial_address.to_field(),
          GENERATOR_INDEX__CONTRACT_ADDRESS_V1 as Field,
        ],
        3
      )
    );

    assert(computed_address.eq(address));

    let nullifier_entry = storage.nullifier_public_key_registry.at(address);
    let incoming_entry = storage.nullifier_public_key_registry.at(address);
    let outgoing_entry = storage.nullifier_public_key_registry.at(address);
    let tagging_entry = storage.nullifier_public_key_registry.at(address);

    nullifier_entry.schedule_value_change(nullifier_public_key);
    incoming_entry.schedule_value_change(incoming_public_key);
    outgoing_entry.schedule_value_change(outgoing_public_key);
    tagging_entry.schedule_value_change(tagging_public_key);
  }
}

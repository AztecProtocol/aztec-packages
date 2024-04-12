contract KeyRegistry {
  use dep::aztec::{
    avm::hash::poseidon,
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
        GENERATOR_INDEX__CONTRACT_ADDRESS,
        GENERATOR_INDEX__PARTIAL_ADDRESS
      },
    },
  };

  global KEY_ROTATION_DELAY = 5;

  #[aztec(storage)]
  struct Storage {
    nullifier_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    incoming_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    outgoing_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    tagging_public_key_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
  }

  #[aztec(public)]
  fn register(
    nullifier_public_key: Field,
    incoming_public_key: Field,
    outgoing_public_key: Field,
    tagging_public_key: Field,
  ) {
    assert((nullifier_public_key != 0) & (incoming_public_key != 0) & (outgoing_public_key != 0) & (tagging_public_key != 0));
    let nullifier_entry = storage.nullifier_public_key_registry.at(context.msg_sender());
    let incoming_entry = storage.nullifier_public_key_registry.at(context.msg_sender());
    let outgoing_entry = storage.nullifier_public_key_registry.at(context.msg_sender());
    let tagging_entry = storage.nullifier_public_key_registry.at(context.msg_sender());

    nullifier_entry.schedule_value_change(nullifier_public_key);
    incoming_entry.schedule_value_change(incoming_public_key);
    outgoing_entry.schedule_value_change(outgoing_public_key);
    tagging_entry.schedule_value_change(tagging_public_key);
  }

  #[aztec(public)]
  fn register_from_preimage(
    address: AztecAddress,
    contract_class_id: ContractClassId,
    initialization_hash: Field,
    salt: Field,
    deployer: AztecAddress,
    portal_contract_address: EthAddress,
    nullifier_public_key: Field,
    incoming_public_key: Field,
    outgoing_public_key: Field,
    tagging_public_key: Field,
  ) {
    assert((nullifier_public_key != 0) & (incoming_public_key != 0) & (outgoing_public_key != 0) & (tagging_public_key != 0));
    context.call_public_function(
      context.this_address(),
      FunctionSelector::from_signature("assert_non_membership_public((Field))"),
      [address.to_field()],
      GasOpts::default()
    ).assert_empty();

    let partial_address = PartialAddress::compute(
        contract_class_id,
        salt,
        initialization_hash,
        portal_contract_address,
        deployer
    );

    // TODO (ek): Do it below after refactoring all public_keys_hash_elemtns
    // let public_keys_hash = PublicKeysHash::compute(nullifier_public_key, tagging_public_key, incoming_public_key, outgoing_public_key);
    // let address = AztecAddress::compute(public_keys_hash, partial_address);
    let public_keys_hash = poseidon([
        nullifier_public_key,
        tagging_public_key,
        incoming_public_key,
        outgoing_public_key,
        GENERATOR_INDEX__PARTIAL_ADDRESS as Field,
      ],
    );

    let computed_address = AztecAddress::from_field(
      poseidon([
          public_keys_hash.to_field(),
          partial_address.to_field(),
          GENERATOR_INDEX__CONTRACT_ADDRESS as Field,
        ],
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

  #[aztec(public)]
  fn assert_non_membership_public(
    address: AztecAddress
  ) {
    let registry_entry = storage.nullifier_public_key_registry.at(address);
    let nullifier_key = registry_entry.get_current_value_in_public();

    assert(nullifier_key == 0);
  }

  #[aztec(private)]
  fn assert_non_membership_private(
    address: AztecAddress
  ) {
    let registry_entry = storage.nullifier_public_key_registry.at(address);
    let nullifier_key = registry_entry.get_current_value_in_private();

    assert(nullifier_key == 0);
  }

  #[aztec(public)]
  fn get_nullifying_public_key(
    address: AztecAddress
  ) {
    let registry_entry = storage.nullifier_public_key_registry.at(address);
    registry_entry.get_current_value_in_public()
  }
}

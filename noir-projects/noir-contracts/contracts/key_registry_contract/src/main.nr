contract KeyRegistry {
    use dep::authwit::auth::assert_current_call_valid_authwit_public;

    use dep::aztec::{
        state_vars::{SharedMutable, Map},
        protocol_types::{
        grumpkin_point::GrumpkinPoint, address::{AztecAddress, PartialAddress},
        hash::poseidon2_hash
    }
    };

    global KEY_ROTATION_DELAY = 5;

    #[aztec(storage)]
  struct Storage {
    // The following stores a hash of individual master public keys
    // If you change slots of vars bellow, you must update the slot in `SharedMutablePrivateGetter` in aztec-nr keys.
    nullifier_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    incoming_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    outgoing_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
    tagging_registry: Map<AztecAddress, SharedMutable<Field, KEY_ROTATION_DELAY>>,
  }

    #[aztec(public)]
  fn rotate_nullifier_public_key(
        address: AztecAddress,
        new_nullifier_public_key: GrumpkinPoint,
        nonce: Field
    ) {
        assert(!new_nullifier_public_key.is_zero(), "New nullifier public key must be non-zero");

        // TODO: (#6137)
        if (!address.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, address);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let nullifier_registry = storage.nullifier_registry.at(address);
        nullifier_registry.schedule_value_change(poseidon2_hash(new_nullifier_public_key.serialize()));
    }

    #[aztec(public)]
  fn register(
        address: AztecAddress,
        partial_address: PartialAddress,
        nullifier_public_key: GrumpkinPoint,
        incoming_public_key: GrumpkinPoint,
        outgoing_public_key: GrumpkinPoint,
        tagging_public_key: GrumpkinPoint
    ) {
        assert(
            !partial_address.is_zero()
            & !nullifier_public_key.is_zero()
            & !incoming_public_key.is_zero()
            & !outgoing_public_key.is_zero()
            & !tagging_public_key.is_zero(), "All public keys must be non-zero"
        );

        // We could also pass in original_public_keys_hash instead of computing it here, if all we need the original one is for being able to prove ownership of address
        let computed_address = AztecAddress::compute_from_public_keys_and_partial_address(
            nullifier_public_key,
            incoming_public_key,
            outgoing_public_key,
            tagging_public_key,
            partial_address
        );

        assert(computed_address.eq(address), "Computed address does not match supplied address");

        let nullifier_registry = storage.nullifier_registry.at(address);
        let incoming_registry = storage.incoming_registry.at(address);
        let outgoing_registry = storage.outgoing_registry.at(address);
        let tagging_registry = storage.tagging_registry.at(address);

        nullifier_registry.schedule_value_change(poseidon2_hash(nullifier_public_key.serialize()));
        incoming_registry.schedule_value_change(poseidon2_hash(incoming_public_key.serialize()));
        outgoing_registry.schedule_value_change(poseidon2_hash(outgoing_public_key.serialize()));
        tagging_registry.schedule_value_change(poseidon2_hash(tagging_public_key.serialize()));
    }
}

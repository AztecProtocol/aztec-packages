mod balance_utils;
mod notes;
mod storage;

contract PublicPrivate {
    use dep::std::hash::pedersen;
    use dep::aztec::abi;
    use dep::aztec::context::Context;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::PublicContextInputs;
    use dep::aztec::log::emit_encrypted_log;

    // Private state
    use dep::aztec::types::point::Point;

    // oracles
    use dep::aztec::oracle::create_commitment::create_commitment;
    use dep::aztec::oracle::create_l2_to_l1_message::create_l2_to_l1_message;
    use dep::aztec::oracle::create_nullifier::create_nullifier;
    use dep::aztec::oracle::get_commitment::get_commitment;

    use crate::balance_utils;
    use crate::notes::transparent_note::TransparentNote;
    use crate::notes::value_note::ValueNote;
    use crate::storage::Storage;

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        Context::new().finish(inputs)
    }

    open fn mintFromPublicToPrivate(
        _inputs: PublicContextInputs,
        amount: Field,
        secretHash: Field,
        _padding: [Field; abi::MAX_ARGS - 2]
    ) {
        // Create a commitment to the amount
        let note = TransparentNote::new(amount, secretHash);

        // Public oracle call to emit new commitment.
        create_commitment(note.get_commitment());
    }

    // Purely exists for testing
    open fn createL2ToL1MessagePublic(
        _inputs: PublicContextInputs,
        amount: Field,
        secretHash: Field,
        _padding: [Field; abi::MAX_ARGS - 3]
    ) {
        // Create a commitment to the amount
        let note = TransparentNote::new(amount, secretHash);
        
        // Public oracle call to emit new commitment.
        create_l2_to_l1_message(note.get_commitment());
    }

    // Purely exists for testing
    open fn createNullifierPublic(
        _inputs: PublicContextInputs,
        amount: Field,
        secretHash: Field,
        _padding: [Field; abi::MAX_ARGS - 3]
    ) -> Field {
    
        // Create a commitment to the amount
        let note = TransparentNote::new(amount, secretHash);
        
        // Public oracle call to emit new commitment.
        create_nullifier(note.get_commitment());
        0
    }

    fn mintFromPublicMessage(
        inputs: PrivateContextInputs,
        amount: Field,
        secret: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new();
        context.args = context.args.push_array([amount, secret, owner.x, owner.y]);

        // Assert that the note exists within the tree
        let public_note = TransparentNote::new_from_secret(amount, secret);
        context = public_note.consume_in_secret(context, inputs.roots.private_data_tree_root, secret);

        // Mint the tokens
        let owner_balance = storage.balances.at(owner.x);
        let note = ValueNote::new(amount, owner);

        // Insert note and emit encrypted preimage
        context = owner_balance.insert(context, note);
        let preimage = note.serialise();
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, preimage);

        context.finish(inputs)
    }

    /// ABI getBalance type "unconstrained"
    fn getBalance(
        owner: Point,
        _padding: [Field; abi::MAX_ARGS - 2]
    ) -> pub Field {
        let storage = Storage::init();
        let owner_balance = storage.balances.at(owner.x);
        balance_utils::get_balance(owner_balance.storage_slot, 0)
    }
}

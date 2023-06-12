use dep::std::hash::pedersen;

contract PublicPrivate {
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::abi::PublicContextInputs;

    // Public state
    use dep::aztec3::state_vars::storage_map::StorageMap;
    use dep::aztec3::state_vars::storage_field::StorageField;

    // Private state
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::map::Map;
    use dep::aztec3::state_vars::set::Set;
    use dep::aztec3::notes::value_note::Note;

    use dep::aztec3::messaging::get_commitment_getter_data::make_commitment_getter_data;

    use crate::TransparentNote;

    // oracles
    use dep::aztec3::oracle::logs::emit_encrypted_log;
    use dep::aztec3::oracle::create_commitment::create_commitment;
    use dep::aztec3::oracle::create_l2_to_l1_message::create_l2_to_l1_message;
    use dep::aztec3::oracle::get_commitment::get_commitment;


    global balances = Map { storage_slot: 1 };

    fn constructor(
        inputs: pub PrivateContextInputs,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        PrivateFunctionContext::new().finish(inputs)
    }


    open fn mintFromPublicToPrivate(
        _inputs: PublicContextInputs,
        amount: Field,
        secretHash: Field,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> Field{
    
        // Create a commitment to the amount
        let note = TransparentNote::new(amount, secretHash);
        
        // Public oracle call to emit new commitment.
        create_commitment(note.get_commitment());
        0
    }

    open fn createL2ToL1MessagePublic(
        _inputs: PublicContextInputs,
        amount: Field,
        secretHash: Field,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> Field {
    
        // Create a commitment to the amount
        let note = TransparentNote::new(amount, secretHash);
        
        // Public oracle call to emit new commitment.
        create_l2_to_l1_message(note.get_commitment());
        0
    }


    fn mintFromPublicMessage(
        inputs: pub PrivateContextInputs,
        amount: pub Field,
        secret: pub Field,
        owner: pub Point,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([amount, secret, owner.x, owner.y]);

        let from_public_note = TransparentNote::new_from_secret(amount, secret);

        let commitment = from_public_note.get_commitment();

        let commitment_oracle_call = get_commitment(commitment);
        let commitment_data = make_commitment_getter_data(commitment_oracle_call, 0);

        constrain inputs.roots.private_data_tree_root == commitment_data.root;

        let nullifier = TransparentNote::compute_nullifier(secret, commitment, commitment_data.leaf_index);
        context = context.push_new_nullifier(nullifier);

        // Mint the tokens
        let owner_balance = balances.at(owner.x);
        let note = Note::new(amount, owner);

        // Insert note and emit encrypted preimage
        context = owner_balance.insert(context, note);
        constrain emit_encrypted_log(inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, note) == 0;

        context.finish(inputs)
    }

}


struct TransparentNote {
    amount: Field,
    secretHash: Field,
}

impl TransparentNote {
    fn new(amount: Field, secretHash: Field) -> Self {
        Self { amount, secretHash }
    }

    fn new_from_secret(amount: Field, secret: Field) -> Self {
        let secretHash = pedersen([secret])[0];
        TransparentNote {
            amount,
            secretHash,
        }
    }

    fn get_commitment(self) -> Field {
        pedersen([self.amount, self.secretHash])[0]
    }

    fn knows_secret(self, secret: Field) {
        let hash = pedersen([secret])[0];
        constrain self.secretHash == hash;
    }

    fn compute_nullifier(secret: Field, siloed_commitment: Field, index: Field) -> Field {
        // Create a nullifier for the message based on its index in the tree
        
        pedersen([secret, siloed_commitment, index])[0]
    }

}
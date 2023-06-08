
contract PublicToken {
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::abi::CallContext;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::storage_map::StorageMap;
    use dep::aztec3::state_vars::storage_field::StorageField;
    use dep::aztec3::oracle::transparent_message::notify_created_transparent_message;

    global balances = StorageMap { storage_slot: 1 };
    global shielded_balances = Map { storage_slot: 2 };

    fn constructor(
        inputs: pub PrivateContextInputs,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        PrivateFunctionContext::new().finish(inputs)
    }



    open fn mint_to_private_shielded(
        inputs: PublicContextInputs,
        amount: Field,
        secret_hash: Field,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_PUBLIC_INPUTS_LENGTH] {
        // Create a commitment that contains the hash of the amount and the secret hash

        // perform hash
        // use a pedersen -> do this in the transparent note constructor

        // Abuse that a % p + b % p = (a + b) % p and that low < p
        let content_hash = low + high * v;

        // Place this commitment inside the message hash
        // Add new created transparent note oracle call, what storage slot should these be hashed by etc.
        constrain notify_created_transparent_message(content_hash) == 0;
        inputs.context.push_new_note_hash(content_hash);


    }

    // Same as the above message however the note is not broadcast in the block logs
    // open fn mint_to_private_shielded_no_broadcast(

    // )


    open fn mint_to_private_open(
        _call_context: CallContext,
        amount: Field,
        recipient: Point,
        __padding: [Field, dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub Field {
        // Create and insert a note for the following amount
        let shielded_balance = shielded_balances.at(recipient.x);
        
        let note = Note::new(amount, recipient);

        shielded_balance.insert(context, note)
            .finish(inputs);
    }


    struct TransparentNote {
        amount: pub Field,
        secret: pub Field,

        index: Field
    }

    impl TransparentNote {
        pub fn new(amount, secretHash) -> Self {
            // create the new note
        }


        pub fn get(amount, secret) -> Self {

            // compute hash

            // request note index

            TransparentNote {
                amount,
                secret,
                index
            }
        }


        pub fn nullify(self, ) {
            context.create_nullifier(self.hash());
        }
    }

    fn claim_mint_private(
        inputs: pub PrivateContextInputs
        amount: pub Field,
        secret: pub Field,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([amount, recipient, secret]);

        // check that the secret resolves to the same secret hash as is in the note



        let owner_balance = balances.at(owner.x);
        let note = Note::new(amount, owner);


        let note = TransparentNote.new(amount, secret);
        let note_instance = note.get(); // 
        trans_note.nullify(context);

    }

}

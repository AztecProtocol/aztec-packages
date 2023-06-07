
contract PublicToken {
    use dep::aztec3::abi::Inputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::abi::CallContext;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::storage_map::StorageMap;
    use dep::aztec3::state_vars::storage_field::StorageField;
    use dep::aztec3::oracle::transparent_message::notify_created_transparent_message;

    global balances = StorageMap { storage_slot: 1 };
    global shielded_balances = Map { storage_slot: 2 };

    fn constructor(
        inputs: pub Inputs,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        PrivateFunctionContext::new().finish(inputs)
    }



    open fn mint_to_private_shielded(
        call_context: CallContext,
        amount: Field,
        secret_hash: Field,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_PUBLIC_INPUTS_LENGTH] {
        // Create a commitment that contains the hash of the amount and the secret hash

        // perform hash
        let mut hash_bytes: [u8; 64] = [0; 64];
        let amount_bytes = amount.to_be_bytes(32);
        let secret_hash_bytes = secret_hash.to_be_bytes(32);

        hash_bytes[0] = amount_bytes[0];
        hash_bytes[1] = amount_bytes[1];
        hash_bytes[2] = amount_bytes[2];
        hash_bytes[3] = amount_bytes[3];
        hash_bytes[4] = amount_bytes[4];
        hash_bytes[5] = amount_bytes[5];
        hash_bytes[6] = amount_bytes[6];
        hash_bytes[7] = amount_bytes[7];
        hash_bytes[8] = amount_bytes[8];
        hash_bytes[9] = amount_bytes[9];
        hash_bytes[10] = amount_bytes[10];
        hash_bytes[11] = amount_bytes[11];
        hash_bytes[12] = amount_bytes[12];
        hash_bytes[13] = amount_bytes[13];
        hash_bytes[14] = amount_bytes[14];
        hash_bytes[15] = amount_bytes[15];
        hash_bytes[16] = amount_bytes[16];
        hash_bytes[17] = amount_bytes[17];
        hash_bytes[18] = amount_bytes[18];
        hash_bytes[19] = amount_bytes[19];
        hash_bytes[20] = amount_bytes[20];
        hash_bytes[21] = amount_bytes[21];
        hash_bytes[22] = amount_bytes[22];
        hash_bytes[23] = amount_bytes[23];
        hash_bytes[24] = amount_bytes[24];
        hash_bytes[25] = amount_bytes[25];
        hash_bytes[26] = amount_bytes[26];
        hash_bytes[27] = amount_bytes[27];
        hash_bytes[28] = amount_bytes[28];
        hash_bytes[29] = amount_bytes[29];
        hash_bytes[30] = amount_bytes[30];
        hash_bytes[31] = amount_bytes[31];

        hash_bytes[0  + 32] = secret_hash_bytes[0];
        hash_bytes[1  + 32] = secret_hash_bytes[1];
        hash_bytes[2  + 32] = secret_hash_bytes[2];
        hash_bytes[3  + 32] = secret_hash_bytes[3];
        hash_bytes[4  + 32] = secret_hash_bytes[4];
        hash_bytes[5  + 32] = secret_hash_bytes[5];
        hash_bytes[6  + 32] = secret_hash_bytes[6];
        hash_bytes[7  + 32] = secret_hash_bytes[7];
        hash_bytes[8  + 32] = secret_hash_bytes[8];
        hash_bytes[9  + 32] = secret_hash_bytes[9];
        hash_bytes[10 + 32] = secret_hash_bytes[10];
        hash_bytes[11 + 32] = secret_hash_bytes[11];
        hash_bytes[12 + 32] = secret_hash_bytes[12];
        hash_bytes[13 + 32] = secret_hash_bytes[13];
        hash_bytes[14 + 32] = secret_hash_bytes[14];
        hash_bytes[15 + 32] = secret_hash_bytes[15];
        hash_bytes[16 + 32] = secret_hash_bytes[16];
        hash_bytes[17 + 32] = secret_hash_bytes[17];
        hash_bytes[18 + 32] = secret_hash_bytes[18];
        hash_bytes[19 + 32] = secret_hash_bytes[19];
        hash_bytes[20 + 32] = secret_hash_bytes[20];
        hash_bytes[21 + 32] = secret_hash_bytes[21];
        hash_bytes[22 + 32] = secret_hash_bytes[22];
        hash_bytes[23 + 32] = secret_hash_bytes[23];
        hash_bytes[24 + 32] = secret_hash_bytes[24];
        hash_bytes[25 + 32] = secret_hash_bytes[25];
        hash_bytes[26 + 32] = secret_hash_bytes[26];
        hash_bytes[27 + 32] = secret_hash_bytes[27];
        hash_bytes[28 + 32] = secret_hash_bytes[28];
        hash_bytes[29 + 32] = secret_hash_bytes[29];
        hash_bytes[30  + 32] = secret_hash_bytes[30];
        hash_bytes[31  + 32] = secret_hash_bytes[31];

        let content_sha256 = dep::std::hash::sha256(hash_bytes);

        // // Convert the content_sha256 to a field element
        let mut v = 1;
        let mut high = 0 as Field;
        let mut low = 0 as Field;

        // Unroll loops because otherwise takes forever to compile
        // for i in [15 - i for i in range(16)]:
        //     print('high = high + (content_sha256[{0}] as Field) * v;'.format(i))
        //     print('low = low + (content_sha256[16 + {0}] as Field) * v;'.format(i))
        //     print('v = v * 256;');
        high = high + (content_sha256[15] as Field) * v;
        low = low + (content_sha256[16 + 15] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[14] as Field) * v;
        low = low + (content_sha256[16 + 14] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[13] as Field) * v;
        low = low + (content_sha256[16 + 13] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[12] as Field) * v;
        low = low + (content_sha256[16 + 12] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[11] as Field) * v;
        low = low + (content_sha256[16 + 11] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[10] as Field) * v;
        low = low + (content_sha256[16 + 10] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[9] as Field) * v;
        low = low + (content_sha256[16 + 9] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[8] as Field) * v;
        low = low + (content_sha256[16 + 8] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[7] as Field) * v;
        low = low + (content_sha256[16 + 7] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[6] as Field) * v;
        low = low + (content_sha256[16 + 6] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[5] as Field) * v;
        low = low + (content_sha256[16 + 5] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[4] as Field) * v;
        low = low + (content_sha256[16 + 4] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[3] as Field) * v;
        low = low + (content_sha256[16 + 3] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[2] as Field) * v;
        low = low + (content_sha256[16 + 2] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[1] as Field) * v;
        low = low + (content_sha256[16 + 1] as Field) * v;
        v = v * 256;
        high = high + (content_sha256[0] as Field) * v;
        low = low + (content_sha256[16 + 0] as Field) * v;
        v = v * 256;

        // Abuse that a % p + b % p = (a + b) % p and that low < p
        let content_hash = low + high * v;

        // Place this commitment inside the message hash
        // Add new created transparent note oracle call, what storage slot should these be hashed by etc.
        constrain notify_created_transparent_message(content_hash) == 0;
        context.push_new_note_hash(content_hash);


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


    fn claim_mint_private(
        inputs: pub Inputs
        amount: pub Field,
        recipient: pub Field,
        secret: pub Field,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([amount, recipient, secret]);

        // check that the secret resolves to the same secret hash as is in the note



        let owner_balance = balances.at(owner.x);
        let note = Note::new(amount, owner);
    }

}

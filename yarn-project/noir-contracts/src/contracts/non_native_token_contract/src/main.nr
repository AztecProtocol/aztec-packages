mod balance_utils;
mod generators;
mod value_note;
mod storage;

// Represents an ERC20 token bridged from L1 to L2 via `l1-contracts/test/portals/TokenPortal.sol`. The bridged user
// balance can be stored in both public and private domain. If the balance is stored in the private domain then it
// is represented as a set of notes in the private data tree. If the balance is stored in the public domain then it is
// represented as a single value in the public data tree.
contract NonNativeToken {
    use dep::aztec::abi;
    use dep::aztec::abi::PublicContextInputs;
    use dep::aztec::abi::PrivateContextInputs;

    use dep::aztec::context::Context;
    use dep::aztec::types::point::Point;

    // Private state
    use dep::aztec::state_vars::map::Map;
    use dep::aztec::state_vars::set::Set;

    // Public state

    // oracles
    use dep::aztec::oracle::create_l2_to_l1_message::create_l2_to_l1_message;

    // public messaging
    use dep::aztec::messaging::consume_l1_to_l2_message_public;

    use dep::aztec::log::emit_encrypted_log;

    use dep::aztec::note::note_getter::NoteGetterOptions;

    // Storage variable declarations
    use crate::storage::Storage;

    use crate::value_note::value_note::ValueNote;
    use crate::value_note::filter::get_2_notes;
    use crate::balance_utils;

    fn constructor(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        initial_supply: Field, 
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let balances = storage.balances;

        let mut context = Context::new(inputs, abi::hash_args([initial_supply, owner.x, owner.y]));

        let owner_balance = balances.at(owner.x);
        let note = ValueNote::new(initial_supply, owner);

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        context = owner_balance.insert(context, note);
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, note.serialise());

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        context.finish()
    }

    // Mint Private Function
    // This mint function differs to the typical token mint function as it only allows minting 
    // upon consuming valid messages from a token portal contract
    fn mint(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field, 
        owner: Point,
        owner_address: Field,
        // This field should be hidden
        msg_key: Field,
        secret: Field,
        canceller: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let balances = storage.balances;

        let mut context = Context::new(inputs, abi::hash_args([
            amount, owner.x, owner.y, owner_address, msg_key, secret, canceller
        ]));

        let content_hash = _get_mint_content_hash(amount, owner_address, canceller);

        // Get the l1 message from an oracle call
        let updated_context = context.consume_l1_to_l2_message(inputs, msg_key, content_hash, secret);
        context = updated_context;

        let owner_balance = balances.at(owner.x);
        let note = ValueNote::new(amount, owner);

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        context = owner_balance.insert(context, note);
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, note.serialise());

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        context.finish()
    }



    // Withdraws using user's private balance.
    // @dev Destroys 2 of user's notes and sends a message to the L1 portal contract. That message can then be consumed
    //      by calling the `withdraw` function on the L1 portal contract (assuming the args are set correctly).
    fn withdraw(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field, 
        sender: Point, 
        recipient: Field, // ethereum address in the field
        callerOnL1: Field, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let balances = storage.balances;

        let mut initialContext = Context::new(inputs, abi::hash_args([
            amount, sender.x, sender.y, recipient, callerOnL1
        ]));

        // Gets the set of sender's notes and picks 2 of those.
        let sender_balance = balances.at(sender.x);
        let options = NoteGetterOptions::with_filter(get_2_notes, 0);
        let (mut context, notes) = sender_balance.get_notes(initialContext, options);
        let note1 = notes[0];
        let note2 = notes[1];

        // TODO: Removing this return breaks the circuit (???)
        context.return_values = context.return_values.push(note1.is_real as Field);
        context.return_values = context.return_values.push(note2.is_real as Field);

        // Ensure the notes are actually owned by the sender (to prevent user from generating a valid proof while
        // spending someone else's notes).
        note1.validate(sender);
        note2.validate(sender);

        let sum = note1.value + note2.value;
        assert(sum as u64 >= amount as u64);
        let change_value = sum - amount;

        context = sender_balance.remove(context, note1);
        context = sender_balance.remove(context, note2);

        let change_note = ValueNote::new(change_value, sender);

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        context = sender_balance.insert(context, change_note);
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, sender_balance.storage_slot, change_note.owner, change_note.serialise());
        
        let content = _get_withdraw_content_hash(amount, recipient, callerOnL1);

        context = context.message_portal(content);

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        context.finish()
    }

    // Mint Public Function
    // This mint function differs to the typical token mint function as it only allows minting 
    // upon consuming valid messages from a token portal contract
    open fn mintPublic(
        //*********************************/
        // Should eventually be hidden:
        inputs: PublicContextInputs,
        //*********************************/
        amount: Field, 
        owner_address: Field,
        // This field should be hidden
        msg_key: Field,
        secret: Field,
        canceller: Field,
    ) -> Field {
        let storage = Storage::init();
        let public_balances = storage.public_balances;

        let content_hash = _get_mint_content_hash(amount, owner_address, canceller);

        // Consume message and emit nullifier
        consume_l1_to_l2_message_public(inputs, msg_key, content_hash, secret);

        // Update the public balance
        let recipient_balance = public_balances.at(owner_address);
        let new_balance = recipient_balance.read() + amount;
        recipient_balance.write(new_balance);
        new_balance
    }


    // Withdraws using user's public balance.
    open fn withdrawPublic(
        //*********************************/
        // Should eventually be hidden:
        inputs: PublicContextInputs,
        //*********************************/
        amount: Field,
        recipient: Field,
        callerOnL1: Field, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
    ) {
        let storage = Storage::init();
        let public_balances = storage.public_balances;
        
        let sender = inputs.call_context.msg_sender;
        let sender_balance = public_balances.at(sender);

        let current_sender_balance: Field = sender_balance.read();

        if (current_sender_balance as u120) > (amount as u120) {
            // User has sufficient balance so we decrement it by `amount`
            let _void1 = sender_balance.write(current_sender_balance - amount);
        }  
        // TODO: Revert if there is not enough balance

        let content = _get_withdraw_content_hash(amount, recipient, callerOnL1);

        // Emit the l2 to l1 message
        create_l2_to_l1_message(content);
    }


    // Transfers `amount` of tokens from `sender`'s private balance to a `recipient`.
    // Note: Copied from ZkToken
    fn transfer(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field, 
        sender: Point, 
        recipient: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let balances = storage.balances;

        let mut initialContext = Context::new(inputs, abi::hash_args([
            amount, sender.x, sender.y, recipient.x, recipient.y
        ]));

        // Gets the set of sender's notes and picks 2 of those.
        let sender_balance = balances.at(sender.x);
        let options = NoteGetterOptions::with_filter(get_2_notes, 0);
        let (mut context, notes) = sender_balance.get_notes(initialContext, options);
        let note1 = notes[0];
        let note2 = notes[1];

        // Ensure the notes are actually owned by the sender (to prevent user from generating a valid proof while
        // spending someone else's notes).
        note1.validate(sender);
        note2.validate(sender);

        // Checks that the sum of the notes is greater than or equal to the amount being transferred.
        let sum = note1.value + note2.value;
        assert(sum as u64 >= amount as u64);
        let change_value = sum - amount;

        // Removes the 2 notes from the sender's set of notes.
        context = sender_balance.remove(context, note1);
        context = sender_balance.remove(context, note2);

        // Creates 2 new notes, one for the recipient and one for the sender (change note).
        let change_note = ValueNote::new(change_value, sender);
        let recipient_note = ValueNote::new(amount, recipient);

        // Get the recipient's set of notes.
        let recipient_balance = balances.at(recipient.x);

        // Insert the 2 new notes to the recipient's and sender's sets of notes.
        context = recipient_balance.insert(context, recipient_note);
        context = sender_balance.insert(context, change_note);

        // Emit the newly created encrypted note preimages via oracle calls.
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, recipient_balance.storage_slot, recipient_note.owner, recipient_note.serialise());
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, sender_balance.storage_slot, change_note.owner, change_note.serialise());

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        context.finish()
    }

    /// ABI getBalance type "unconstrained"
    fn getBalance(
        owner: Point,
    ) -> pub Field {
        let storage = Storage::init();
        let owner_balance = storage.balances.at(owner.x);
        
        balance_utils::get_balance(owner_balance.storage_slot)
    }

    // Computes a content hash of a deposit/mint message.
    fn _get_mint_content_hash(amount: Field, owner_address: Field, canceller: Field) -> pub Field {
        let mut hash_bytes: [u8; 100] = [0; 100];
        let amount_bytes = amount.to_be_bytes(32);
        let recipient_bytes = owner_address.to_be_bytes(32);
        let canceller_bytes = canceller.to_be_bytes(32);

        for i in 0..32 {
            hash_bytes[i + 4] = amount_bytes[i];
        }
        for i in 0..32 {
            hash_bytes[i + 36] = recipient_bytes[i];
        }
        for i in 0..32 {
            hash_bytes[i + 68] = canceller_bytes[i];
        }
        
        // Function selector: 0xeeb73071 keccak256('mint(uint256,bytes32,address)')
        hash_bytes[0] = 0xee;
        hash_bytes[1] = 0xb7;
        hash_bytes[2] = 0x30;
        hash_bytes[3] = 0x71;
        
        let content_sha256 = dep::std::hash::sha256(hash_bytes);

        // // Convert the content_sha256 to a field element
        let mut v = 1;
        let mut high = 0 as Field;
        let mut low = 0 as Field;

        for i in 0..16 {
            high = high + (content_sha256[15 - i] as Field) * v;
            low = low + (content_sha256[16 + 15 - i] as Field) * v;
            v = v * 256;
        }

        // Abuse that a % p + b % p = (a + b) % p and that low < p
        let content_hash = low + high * v;
        content_hash
    }

    // Computes a content hash of a withdraw message.
    fn _get_withdraw_content_hash(amount: Field, recipient: Field, callerOnL1: Field) -> pub Field {
        // Compute the content hash
        // Compute sha256(selector || amount || recipient)
        // then convert to a single field element
        // add that to the l2 to l1 messages
        let mut hash_bytes: [u8; 100] = [0; 100];
        let amount_bytes = amount.to_be_bytes(32);
        let recipient_bytes = recipient.to_be_bytes(32);
        let callerOnL1_bytes = callerOnL1.to_be_bytes(32);
        
        //  0xb460af94, selector for "withdraw(uint256,address,address)"
        hash_bytes[0] = 0xb4;
        hash_bytes[1] = 0x60;
        hash_bytes[2] = 0xaf;
        hash_bytes[3] = 0x94;

        for i in 0..32 {
            hash_bytes[i + 4] = amount_bytes[i];
        }
        for i in 0..32 {
            hash_bytes[i + 36] = recipient_bytes[i];
        }
        for i in 0..32 {
            hash_bytes[i + 68] = callerOnL1_bytes[i];
        }
        let content_sha256 = dep::std::hash::sha256(hash_bytes);

        // Convert the content_sha256 to a field element
        let mut v = 1;
        let mut high = 0 as Field;
        let mut low = 0 as Field;
        
        for i in 0..16 {
            high = high + (content_sha256[15 - i] as Field) * v;
            low = low + (content_sha256[16 + 15 - i] as Field) * v;
            v = v * 256;
        }

        // Abuse that a % p + b % p = (a + b) % p and that low < p
        let content = low + high * v;
        content
    }
}

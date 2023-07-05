mod storage;

contract ZkToken {
    // Libs
    use dep::token_utils::{
        balance_utils,
        value_note::{
            value_note::ValueNote,
            filter::get_2_notes,
        }
    };

    use crate::storage::Storage;

    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::note::note_getter::NoteGetterOptions;
    use dep::aztec::types::point::Point;
    use dep::aztec::state_vars::map::Map;
    use dep::aztec::state_vars::set::Set;
    use dep::aztec::log::emit_encrypted_log;
    use dep::aztec::log::emit_unencrypted_log;


    // Constructs the contract and sets `initial_supply` which is fully owned by `owner`.
    fn constructor(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        initial_supply: Field, 
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new(inputs, abi::hash_args([initial_supply, owner.x, owner.y]));

        let owner_balance = storage.balances.at(owner.x);
        let note = ValueNote::new(initial_supply, owner);

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        context = owner_balance.insert(context, note);
        let preimage = note.serialise();
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, preimage);
        context = emit_unencrypted_log(context, "Balance set in constructor");

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        context.finish()
    }

    // Mints `amount` of tokens to `owner`.
    fn mint(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field, 
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new(inputs, abi::hash_args([amount, owner.x, owner.y]));

        let owner_balance = storage.balances.at(owner.x);
        let note = ValueNote::new(amount, owner);

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        context = owner_balance.insert(context, note);
        let preimage = note.serialise();
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, preimage);
        context = emit_unencrypted_log(context, "Coins minted");

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
        context.finish()
    }

    // Transfers `amount` of tokens from `sender` to a `recipient`.
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
        let mut initialContext = Context::new(inputs, abi::hash_args([amount, sender.x, sender.y, recipient.x, recipient.y]));

        // Gets the set of sender's notes and picks 2 of those.
        let sender_balance = storage.balances.at(sender.x);
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
        let recipient_balance = storage.balances.at(recipient.x);

        // Insert the 2 new notes to the recipient's and sender's sets of notes.
        context = recipient_balance.insert(context, recipient_note);
        context = sender_balance.insert(context, change_note);

        // Emit the newly created encrypted note preimages via oracle calls.
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, recipient_balance.storage_slot, recipient_note.owner, recipient_note.serialise());
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, sender_balance.storage_slot, change_note.owner, change_note.serialise());
        context = emit_unencrypted_log(context, "Coins transferred");

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
        context.finish()
    }

    // Transfers `amounts` of tokens from `sender` to 3 `recipients`. Aztec only requires 4 notes per tx - 1 new note for sender's new balance and 1 note each for 3 recipients (for their new balance)
    fn batchTransfer(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        sender: Point, 
        amounts: [Field; 3], 
        recipients: [Point; 3],
        spendFirstNote: bool, // currently we spend only 1 note since kernel commitment length is just 4. 
        // But if this is increased to 16, we need a hack against pending nullifiers. 
        // This lets app dev work on utxo concurrency stuff. What we really need is offset to be provided in `getNotes` in noir.
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut initialContext = Context::new(inputs, abi::hash_args([sender.x, sender.y, amounts[0], amounts[1], amounts[2], recipients[0].x, recipients[1].x, recipients[2].x, recipients[0].y, recipients[1].y, recipients[2].y, spendFirstNote as Field]));
        // Gets the set of sender's notes and picks first 2 of those.
        let sender_balance = storage.balances.at(sender.x);
        let options = NoteGetterOptions::with_filter(get_2_notes, 0);
        let (mut context, notes) = sender_balance.get_notes(initialContext, options);
        let note1 = notes[0];
        let note2 = notes[1];

        // Ensure the notes are actually owned by the sender (to prevent user from generating a valid proof while
        // spending someone else's notes).
        note1.validate(sender);
        note2.validate(sender);

        // Checks that the first notes is greater than or equal to the total amount being transferred.
        let total_amount = amounts[0] + amounts[1] + amounts[2];
        let note_value = if spendFirstNote { note1.value } else { note2.value };
        assert(note_value as u64 >= total_amount as u64);
        let change_value = note_value - total_amount;
        
        // Removes only the note that is meant to be actually spent from the owner's notes.
        if (spendFirstNote) {
            context = sender_balance.remove(context, note1);
        } else {
            context = sender_balance.remove(context, note2);
        }

        // Creates 4 new notes, three for the recipients and one for the sender (change note).
        let change_note = ValueNote::new(change_value, sender);
        let recipient1_note = ValueNote::new(amounts[0], recipients[0]);
        let recipient2_note = ValueNote::new(amounts[1], recipients[1]);
        let recipient3_note = ValueNote::new(amounts[2], recipients[2]);

        // Get the recipient's set of notes.
        let recipient1_balance = storage.balances.at(recipients[0].x);
        let recipient2_balance = storage.balances.at(recipients[1].x);
        let recipient3_balance = storage.balances.at(recipients[2].x);

        // Insert the 2 new notes to the recipient's and sender's sets of notes.
        context = recipient1_balance.insert(context, recipient1_note);
        context = recipient2_balance.insert(context, recipient2_note);
        context = recipient3_balance.insert(context, recipient3_note);
        context = sender_balance.insert(context, change_note);

        // Emit the newly created encrypted note preimages via oracle calls.
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, recipient1_balance.storage_slot, recipient1_note.owner, recipient1_note.serialise());
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, recipient2_balance.storage_slot, recipient2_note.owner, recipient2_note.serialise());
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, recipient3_balance.storage_slot, recipient3_note.owner, recipient3_note.serialise());
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, sender_balance.storage_slot, change_note.owner, change_note.serialise());
        context = emit_unencrypted_log(context, "Coins transferred"); // unencrypted log is emitted here only fors

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
        context.finish()
    }

    /// ABI getBalance type "unconstrained"
    // Helper function to get the balance of a user ("unconstrained" is a Noir alternative of Solidity's "view" function).
    fn getBalance(
        owner: Point,
    ) -> pub Field {
        let storage = Storage::init();

        // Get the set of notes owned by the user.
        let owner_balance = storage.balances.at(owner.x);

        // Return the sum of all notes in the set.
        balance_utils::get_balance(owner_balance.storage_slot)
    }
}

mod storage;
mod point_note;

contract NoAccount {
    // Libs
    use dep::token_utils::{
        balance_utils,
        value_note::{
            filter::get_2_notes,
            value_note::ValueNoteInterface,
            utils::send_note,
            value_note::ValueNote,
        },
    };
    use dep::custom_notes::{
        claim_note::{ClaimNote, ClaimNoteInterface},
        utils::compute_note_hash_and_nullifier,
    };

    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::note::note_getter::NoteGetterOptions;
    use dep::aztec::types::point::Point;
    use dep::aztec::state_vars::map::Map;
    use dep::aztec::state_vars::set::Set;
    use dep::aztec::log::emit_encrypted_log;

    use crate::storage::Storage;
    use crate::point_note::PointNote;


    // Constructs the contract and sets `initial_supply` which is fully owned by `owner`.
    fn constructor(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        initial_supply: Field, 
        owner: Point,
        recipient: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new(inputs, abi::hash_args([initial_supply, owner.x, owner.y, recipient.x, recipient.y]));

        let owner_note = PointNote::new(owner.x, owner.y);
        let recipient_note = PointNote::new(recipient.x, recipient.y);

        context = storage.owner.initialise(context, owner_note);
        context = storage.recipient.initialise(context, recipient_note);

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        let owner_balance = storage.balances.at(owner.x);
        context = send_note(context, owner_balance, initial_supply, owner);

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        context.finish()
    }

    // Transfers full balance of tokens from `owner` to a `recipient`.
    fn poke(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new(inputs, abi::hash_args([]));

        let (context_1, owner) = storage.owner.get_note(context);
        context = context_1;

        let (context_2, recipient) = storage.recipient.get_note(context);
        context = context_2;

        // Pick from the set of owner's notes.
        let owner_balance = storage.balances.at(owner.x);

        let options = NoteGetterOptions::with_filter(get_2_notes, 0);
        let (mut new_context, notes) = owner_balance.get_notes(context, options);
        context = new_context;

        let note1 = notes[0];
        let note2 = notes[1];

        let note_sum = note1.value + note2.value;

        // Removes the 2 notes from the owner's set of notes.
        context = owner_balance.remove(context, note1);
        context = owner_balance.remove(context, note2);

        // Creates new note for the recipient.
        let recipient_point = Point::new(recipient.x, recipient.y);
        let recipient_balance = storage.balances.at(recipient.x);
        context = send_note(context, recipient_balance, note_sum, recipient_point);
        
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
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

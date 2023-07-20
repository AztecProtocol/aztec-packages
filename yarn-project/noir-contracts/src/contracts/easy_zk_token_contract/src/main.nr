mod storage;

contract EasyZkToken {
    // Libs
    use dep::value_note::{
            balance_utils,
            value_note::{
                ValueNoteInterface,
                VALUE_NOTE_LEN,
            },
    };

    // use dep::easy_private_state::easy_private_state::EasyPrivateUint;

    use dep::aztec::{
        abi,
        abi::PrivateContextInputs,
        constants_gen::MAX_NOTE_FIELDS_LENGTH,
        context::Context,
        log::emit_unencrypted_log,
        note::{
            note_getter::NoteGetterOptions,
            note_header::NoteHeader,
            utils::compute_note_hash_and_nullifier,
        },
    };

    use crate::storage::Storage;

    // Constructs the contract and sets `initial_supply` which is fully owned by `owner`.
    fn constructor(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        initial_supply: u120, 
        owner: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let balances = storage.balances;
        let mut context = Context::new(inputs, abi::hash_args([initial_supply as Field, owner]));

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        let owner_balance = balances.at(owner);
        context = owner_balance.add(context, initial_supply, owner);

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
        amount: u120, 
        owner: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let balances = storage.balances;
        let mut context = Context::new(inputs, abi::hash_args([amount as Field, owner]));

        // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
        let owner_balance = balances.at(owner);
        context = owner_balance.add(context, amount, owner);

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
        amount: u120, 
        sender: Field, 
        recipient: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let balances = storage.balances;
        let mut context = Context::new(inputs, abi::hash_args([amount as Field, sender, recipient]));

        // Pick from the set of sender's notes to spend amount.
        let sender_balance = balances.at(sender);
        context = sender_balance.sub(context, amount, sender);

        // Creates new note for the recipient.
        let recipient_balance = storage.balances.at(recipient);
        context = recipient_balance.add(context, amount, recipient);
        
        context = emit_unencrypted_log(context, "Coins transferred");

        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
        context.finish()
    }

    /// ABI getBalance type "unconstrained"
    // Helper function to get the balance of a user ("unconstrained" is a Noir alternative of Solidity's "view" function).
    fn getBalance(
        owner: Field,
    ) -> pub Field {
        let storage = Storage::init();

        // Get the set of notes owned by the user.
        let owner_balance = storage.balances.at(owner);

        // Return the sum of all notes in the set.
        balance_utils::get_balance(owner_balance.storage_slot)
    }

    /// ABI stev type "unconstrained"
    fn stev(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; VALUE_NOTE_LEN]) -> pub [Field; 4] {
        let note_header = NoteHeader { contract_address, nonce, storage_slot };
        compute_note_hash_and_nullifier(ValueNoteInterface, note_header, preimage)
    }
}

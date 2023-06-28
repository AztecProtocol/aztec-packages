mod balance_utils;
mod generators;
mod storage;
mod value_note;

contract ZkToken {
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::note::note_getter::NoteGetterOptions;
    use dep::aztec::types::point::Point;
    use dep::aztec::state_vars::map::Map;
    use dep::aztec::state_vars::set::Set;
    use dep::aztec::log::emit_encrypted_log;
    use dep::aztec::log::emit_unencrypted_log;
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
        let mut context = Context::new();
        context.args = context.args.push_array([initial_supply, owner.x, owner.y]);

        let owner_balance = storage.balances.at(owner.x);
        let note = ValueNote::new(initial_supply, owner);

        // Insert note and emit encrypted note preimage via oracle call
        context = owner_balance.insert(context, note);
        let preimage = note.serialise();
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, preimage);
        context = emit_unencrypted_log(context, "Balance set in constructor");

        context.finish(inputs)
    }

    fn mint(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field, 
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new();
        context.args = context.args.push_array([amount, owner.x, owner.y]);

        let owner_balance = storage.balances.at(owner.x);
        let note = ValueNote::new(amount, owner);

        // Insert note and emit encrypted note preimage via oracle call
        context = owner_balance.insert(context, note);
        let preimage = note.serialise();
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, preimage);
        context = emit_unencrypted_log(context, "Coins minted");

        context.finish(inputs)
    }

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
        let mut initialContext = Context::new();
        initialContext.args = initialContext.args.push_array([amount, sender.x, sender.y, recipient.x, recipient.y]);

        let sender_balance = storage.balances.at(sender.x);
        let options = NoteGetterOptions::new(get_2_notes, 0);
        let (mut context, notes) = sender_balance.get_notes(initialContext, options);
        let note1 = notes[0];
        let note2 = notes[1];

        note1.validate(sender);
        note2.validate(sender);

        let sum = note1.value + note2.value;
        assert(sum as u64 >= amount as u64);
        let change_value = sum - amount;

        context = sender_balance.remove(context, note1);
        context = sender_balance.remove(context, note2);

        let change_note = ValueNote::new(change_value, sender);
        let recipient_note = ValueNote::new(amount, recipient);

        let recipient_balance = storage.balances.at(recipient.x);

        context = recipient_balance.insert(context, recipient_note);
        context = sender_balance.insert(context, change_note);

        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, recipient_balance.storage_slot, recipient_note.owner, recipient_note.serialise());
        context = emit_encrypted_log(context, inputs.call_context.storage_contract_address, sender_balance.storage_slot, change_note.owner, change_note.serialise());
        context = emit_unencrypted_log(context, "Coins transferred");

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

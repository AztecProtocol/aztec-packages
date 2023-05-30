// contract ZkToken {
    // mod balance_utils;
    mod storage;
    use storage::Storage;
    use storage::new_set_over_value_notes;
    use dep::aztec3::abi::Inputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::notes::value_note::ValueNote;
    use dep::aztec3::notes::value_note::NOTE_LEN;
    use dep::aztec3::types::point::Point;
    // use dep::aztec3::state_vars::map::Map;
    use dep::aztec3::state_vars::set::Set;

    //*********************************/
    // global balances = Map { storage_slot: 1 };
    // Should eventually be replaced by:
    // `balances: Mapping<Field, Set<ValueNote>>;`
    //*********************************/

    // fn constructor(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: pub Inputs,
    //     //*********************************/
    //     initial_supply: pub Field, 
    //     owner: pub Point,
    // ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
    //     let mut context = PrivateFunctionContext::new();
    //     context.args = context.args.push_array([initial_supply, owner.x, owner.y]);

    //     let balances = Storage::init().balances;

    //     let owner_balance: Set = balances.at(owner.x);
    //     let note = ValueNote::new(initial_supply, owner);

    //     owner_balance.insert(context, note)
    //         .finish(inputs)
    // }

    // fn mint(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: pub Inputs,
    //     //*********************************/
    //     amount: pub Field, 
    //     owner: pub Point,
    // ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
    //     let mut context = PrivateFunctionContext::new();
    //     context.args = context.args.push_array([amount, owner.x, owner.y]);

    //     let balances = Storage::init().balances;

    //     let owner_balance: Set = balances.at(owner.x);
    //     let note = ValueNote::new(amount, owner);

    //     owner_balance.insert(context, note)
    //         .finish(inputs)
    // }

    // TRANSFER
    fn main(
        //*********************************/
        // Should eventually be hidden:
        inputs: pub Inputs,
        //*********************************/
        amount: pub Field, 
        sender: pub Point, 
        recipient: pub Point,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        let mut initialContext = PrivateFunctionContext::new();
        initialContext.args = initialContext.args.push_array([amount, sender.x, sender.y, recipient.x, recipient.y]);

        let balances = Storage::init().balances;

        let sender_balance: Set<ValueNote, NOTE_LEN> = balances.at(sender.x);
        let (mut context, (note1, note2)) = sender_balance.get_2(inputs, initialContext);

        // TODO: Removing this return breaks the circuit (???)
        // context.return_values = context.return_values.push(note1.is_real as Field);
        // context.return_values = context.return_values.push(note2.is_real as Field);

        if note1.is_real {
            note1.owner.assert_equal(sender);
        } else {
            assert (note1.value == 0);
        }
        if note2.is_real {
            note2.owner.assert_equal(sender);
        } else {
            assert (note2.value == 0);
        }

        let sum = note1.value + note2.value;
        assert (sum as u64 >= amount as u64);
        let change_value = sum - amount;
        // let change_value = 1;

        context = sender_balance.remove(inputs, context, note1);
        context = sender_balance.remove(inputs, context, note2);

        let change_note = ValueNote::new(change_value, sender);
        let recipient_note = ValueNote::new(amount, recipient);

        let recipient_balance: Set<ValueNote, NOTE_LEN> = balances.at(recipient.x);

        context = recipient_balance.insert(context, recipient_note);
        context = sender_balance.insert(context, change_note);

        context.finish(inputs)
    }

    // /// ABI getBalance type "unconstrained"
    // fn getBalance(
    //     owner: Point,
    // ) -> pub Field {
    //     let balances = Storage::init().balances;
        
    //     let owner_balance: Set = balances.at(owner.x);
        
    //     balance_utils::get_balance(owner_balance.storage_slot)
    // }
// }

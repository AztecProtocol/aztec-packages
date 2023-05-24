contract PublicToken {
    use dep::aztec3::abi::Inputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::abi::CallContext;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::storage_map::StorageMap;
    use dep::aztec3::state_vars::storage_field::StorageField;

    global balances = StorageMap { storage_slot: 1 };
    global total_supply = StorageField { storage_slot: 2 };

    fn constructor(
        inputs: pub Inputs,
    ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
        PrivateFunctionContext::new().finish(inputs)
    }

    open fn mint(
        _call_context: CallContext,
        amount: Field,
        recipient: Point,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub Field {
        let recipient_balance = balances.at(recipient.x);
        let recipient_bal_amount = recipient_balance.write(recipient_balance.read() + amount);

        let _r = total_supply.write(total_supply.read() + amount);

        recipient_bal_amount
    }

    open fn transfer(
        call_context: CallContext,
        amount: Field,
        recipient: Point,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub Field {
        let sender = call_context.msg_sender;
        
        let sender_balance = balances.at(sender);
        let recipient_balance = balances.at(recipient.x);

        let current_sender_balance = sender_balance.read();
        let current_recipient_balance = recipient_balance.read();

        // TODO: Handle larger integer values ("long integers are not yet supported")
        if (current_sender_balance as u120) > (amount as u120) {
            // TODO: Compiler complains if we don't assign the result of the write to anything
            let _void1 = sender_balance.write(current_sender_balance - amount);
            recipient_balance.write(current_recipient_balance + amount)
        } else {
            // TODO: Revert if there is not enough balance
            current_recipient_balance
        }
    }

    open fn burn(
        call_context: CallContext,
        amount: Field,
        _padding: [Field; dep::aztec3::abi::MAX_ARGS - 3]
    ) -> pub Field {
        let sender = call_context.msg_sender;
        let sender_balance = balances.at(sender);

        let current_sender_balance = sender_balance.read();
        let new_sender_balance: Field = current_sender_balance - amount;
        let _r = sender_balance.write(new_sender_balance);

        let current_supply = total_supply.read();
        let new_supply = current_supply - amount;
        total_supply.write(new_supply)
    }

}

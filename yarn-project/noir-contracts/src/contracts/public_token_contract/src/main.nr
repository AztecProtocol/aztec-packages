mod storage;

contract PublicToken {
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::PublicContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::oracle::logs::emit_unencrypted_log;
    use dep::aztec::types::point::Point;
    use crate::storage::Storage;

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        Context::new().finish(inputs)
    }

    open fn mint(
        _inputs: PublicContextInputs,
        amount: Field,
        recipient: Point,
        _padding: [Field; abi::MAX_ARGS - 3]
    ) -> pub Field {
        let storage = Storage::init();
        let recipient_balance = storage.balances.at(recipient.x);
        let new_amount = recipient_balance.read() + amount;
        // TODO: Remove return value.
        let hash = emit_unencrypted_log("Coins minted");
        recipient_balance.write(new_amount);
        new_amount
    }

    open fn transfer(
        inputs: PublicContextInputs,
        amount: Field,
        recipient: Point,
        _padding: [Field; abi::MAX_ARGS - 3]
    ) -> pub Field {
        let storage = Storage::init();
        let sender = inputs.call_context.msg_sender;

        let sender_balance = storage.balances.at(sender);
        let recipient_balance = storage.balances.at(recipient.x);

        let current_sender_balance: Field = sender_balance.read();
        let current_recipient_balance = recipient_balance.read();

        if (current_sender_balance as u254 > amount as u254) {
            sender_balance.write(current_sender_balance - amount);
            // TODO: Compiler complains if we don't assign the result of the write to anything
            let hash = emit_unencrypted_log("Coins transferred");
            let amount = current_recipient_balance + amount;
            recipient_balance.write(amount);
            amount
        } else {
            // TODO: Revert if there is not enough balance
            current_recipient_balance
        }
    }

}

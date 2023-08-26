mod storage;

contract PublicToken {
    use dep::aztec::abi;
    use dep::aztec::abi::Hasher;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::PublicContextInputs;
    use dep::aztec::context::{
        PrivateContext,
        PublicContext,
    };
    use dep::aztec::oracle::logs::emit_unencrypted_log;
    use crate::storage::Storage;

    // Constructs the contract.
    #[aztec(private)]
    fn constructor() {}

    // Mints `amount` of tokens to a `recipient`.
    #[aztec(public)]
    open fn mint(
        amount: Field,
        recipient: Field,
    ) {

        let storage = Storage::init();
        let recipient_balance = storage.balances.at(recipient);
        let new_amount = recipient_balance.read() + amount;
        // TODO: Remove return value.
        let _hash = emit_unencrypted_log("Coins minted");
        recipient_balance.write(new_amount);

        context.return_values.push(new_amount);
    }

    // Transfers `amount` of tokens from `msg_sender` to `recipient`.
    #[aztec(public)]
    open fn transfer(
        amount: Field,
        recipient: Field,
    ) {
        let storage = Storage::init();
        let sender = context.msg_sender();

        let sender_balance = storage.balances.at(sender);
        let recipient_balance = storage.balances.at(recipient);

        let current_sender_balance: Field = sender_balance.read();
        let current_recipient_balance = recipient_balance.read();

        // TODO: Should support larger numbers.
        let mut return_value = 0;

        if (current_sender_balance as u126 > amount as u126) {
            sender_balance.write(current_sender_balance - amount);
            // TODO: Compiler complains if we don't assign the result of the write to anything
            let _hash = emit_unencrypted_log("Coins transferred");
            let amount = current_recipient_balance + amount;
            recipient_balance.write(amount);
            return_value = amount;
        } else {
            // TODO: Revert if there is not enough balance
            return_value = current_recipient_balance;
        }
        context.return_values.push(return_value);
    }

    unconstrained fn publicBalanceOf(
        owner: Field,
    ) -> Field {
        let storage = Storage::init();
        storage.balances.at(owner).read()
    }
}

// docs:start:start
use aztec::macros::aztec;

// docs:start:imports
#[aztec]
pub contract BobToken {
    // docs:end:start
    use aztec::{
        macros::{functions::{initializer, private, public, utility, internal}, storage::storage},
        protocol_types::address::AztecAddress, state_vars::Map,
        state_vars::public_mutable::PublicMutable,
    };
    // docs:end:imports

    use easy_private_state::EasyPrivateUint;

    // docs:start:public_storage
    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        // Giggle's admin address
        owner: PublicMutable<AztecAddress, Context>,
        // Public balances - visible for transparency
        public_balances: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
        // docs:end:public_storage
        // Private balances - only the owner can see these
        private_balances: Map<AztecAddress, EasyPrivateUint<Context>, Context>,
    }
    // docs:end:storage

    // docs:start:setup
    #[initializer]
    #[public]
    fn setup() {
        // Giggle becomes the owner who can mint mental health tokens
        storage.owner.write(context.msg_sender());
    }
    // docs:end:setup

    // docs:start:mint_public
    #[public]
    fn mint_public(employee: AztecAddress, amount: u64) {
        // Only Giggle can mint tokens
        assert_eq(context.msg_sender(), storage.owner.read(), "Only Giggle can mint BOB tokens");

        // Add tokens to employee's public balance
        let current_balance = storage.public_balances.at(employee).read();
        storage.public_balances.at(employee).write(current_balance + amount);
    }
    // docs:end:mint_public

    // docs:start:transfer_public
    #[public]
    fn transfer_public(to: AztecAddress, amount: u64) {
        let sender = context.msg_sender();
        let sender_balance = storage.public_balances.at(sender).read();
        assert(sender_balance >= amount, "Insufficient BOB tokens");

        // Deduct from sender
        storage.public_balances.at(sender).write(sender_balance - amount);

        // Add to recipient
        let recipient_balance = storage.public_balances.at(to).read();
        storage.public_balances.at(to).write(recipient_balance + amount);
    }
    // docs:end:transfer_public

    // docs:start:transfer_ownership
    #[public]
    fn transfer_ownership(new_owner: AztecAddress) {
        assert_eq(context.msg_sender(), storage.owner.read(), "Only current admin can transfer ownership");
        storage.owner.write(new_owner);
    }
    // docs:end:transfer_ownership

    // docs:start:public_to_private
    #[private]
    fn public_to_private(amount: u64) {
        let sender = context.msg_sender();
        // This will enqueue a public function to deduct from public balance
        BobToken::at(context.this_address())._deduct_public_balance(sender, amount).enqueue(&mut context);
        // Add to private balance
        storage.private_balances.at(sender).add(amount, sender);
    }
    // docs:end:public_to_private

    // docs:start:_deduct_public_balance
    #[public]
    #[internal]
    fn _deduct_public_balance(owner: AztecAddress, amount: u64) {
        let balance = storage.public_balances.at(owner).read();
        assert(balance >= amount, "Insufficient public BOB tokens");
        storage.public_balances.at(owner).write(balance - amount);
    }
    // docs:end:_deduct_public_balance


    // docs:start:transfer_private
    #[private]
    fn transfer_private(to: AztecAddress, amount: u64) {
        let sender = context.msg_sender();
        // Spend sender's notes (consumes existing notes)
        storage.private_balances.at(sender).sub(amount, sender);
        // Create new notes for recipient
        storage.private_balances.at(to).add(amount, to);
    }
    // docs:end:transfer_private

    // docs:start:check_balances
    #[utility]
    unconstrained fn private_balance_of(owner: AztecAddress) -> Field {
        storage.private_balances.at(owner).get_value()
    }

    #[utility]
    unconstrained fn public_balance_of(owner: AztecAddress) -> pub u64 {
        storage.public_balances.at(owner).read()
    }
    // docs:end:check_balances

    // docs:start:_assert_is_owner
    #[public]
    #[internal]
    fn _assert_is_owner(address: AztecAddress) {
        assert_eq(address, storage.owner.read(), "Only Giggle can mint BOB tokens");
    }
    // docs:end:_assert_is_owner

    // docs:start:mint_private
    #[private]
    fn mint_private(employee: AztecAddress, amount: u64) {
        // Enqueue ownership check (will revert if not Giggle)
        BobToken::at(context.this_address())
            ._assert_is_owner(context.msg_sender())
            .enqueue(&mut context);

        // If check passes, mint tokens privately
        storage.private_balances.at(employee).add(amount, employee);
    }
    // docs:end:mint_private


    // docs:start:private_to_public
    #[private]
    fn private_to_public(amount: u64) {
        let sender = context.msg_sender();
        // Remove from private balance
        storage.private_balances.at(sender).sub(amount, sender);
        // Enqueue public credit
        BobToken::at(context.this_address())
            ._credit_public_balance(sender, amount)
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _credit_public_balance(owner: AztecAddress, amount: u64) {
        let balance = storage.public_balances.at(owner).read();
        storage.public_balances.at(owner).write(balance + amount);
    }
    // docs:end:private_to_public
}

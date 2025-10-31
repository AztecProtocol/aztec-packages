// docs:start:start
use aztec::macros::aztec;

// docs:start:imports
#[aztec]
pub contract BobToken {
    // docs:end:start
    use aztec::{
        macros::{functions::{external, initializer, only_self}, storage::storage},
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
    #[external("public")]
    fn setup() {
        // Giggle becomes the owner who can mint mental health tokens
        self.storage.owner.write(self.msg_sender().unwrap());
    }
    // docs:end:setup

    // docs:start:mint_public
    #[external("public")]
    fn mint_public(employee: AztecAddress, amount: u64) {
        // Only Giggle can mint tokens
        assert_eq(self.msg_sender().unwrap(), self.storage.owner.read(), "Only Giggle can mint BOB tokens");

        // Add tokens to employee's public balance
        let current_balance = self.storage.public_balances.at(employee).read();
        self.storage.public_balances.at(employee).write(current_balance + amount);
    }
    // docs:end:mint_public

    // docs:start:transfer_public
    #[external("public")]
    fn transfer_public(to: AztecAddress, amount: u64) {
        let sender = self.msg_sender().unwrap();
        let sender_balance = self.storage.public_balances.at(sender).read();
        assert(sender_balance >= amount, "Insufficient BOB tokens");

        // Deduct from sender
        self.storage.public_balances.at(sender).write(sender_balance - amount);

        // Add to recipient
        let recipient_balance = self.storage.public_balances.at(to).read();
        self.storage.public_balances.at(to).write(recipient_balance + amount);
    }
    // docs:end:transfer_public

    // docs:start:transfer_ownership
    #[external("public")]
    fn transfer_ownership(new_owner: AztecAddress) {
        assert_eq(self.msg_sender().unwrap(), self.storage.owner.read(), "Only current admin can transfer ownership");
        self.storage.owner.write(new_owner);
    }
    // docs:end:transfer_ownership

    // docs:start:public_to_private
    #[external("private")]
    fn public_to_private(amount: u64) {
        let sender = self.msg_sender().unwrap();
        // This will enqueue a public function to deduct from public balance
        BobToken::at(self.address)._deduct_public_balance(sender, amount).enqueue(self.context);
        // Add to private balance
        self.storage.private_balances.at(sender).add(amount, sender);
    }
    // docs:end:public_to_private

    // docs:start:_deduct_public_balance
    #[external("public")]
    #[only_self]
    fn _deduct_public_balance(owner: AztecAddress, amount: u64) {
        let balance = self.storage.public_balances.at(owner).read();
        assert(balance >= amount, "Insufficient public BOB tokens");
        self.storage.public_balances.at(owner).write(balance - amount);
    }
    // docs:end:_deduct_public_balance


    // docs:start:transfer_private
    #[external("private")]
    fn transfer_private(to: AztecAddress, amount: u64) {
        let sender = self.msg_sender().unwrap();
        // Spend sender's notes (consumes existing notes)
        self.storage.private_balances.at(sender).sub(amount, sender);
        // Create new notes for recipient
        self.storage.private_balances.at(to).add(amount, to);
    }
    // docs:end:transfer_private

    // docs:start:check_balances
    #[external("utility")]
    unconstrained fn private_balance_of(owner: AztecAddress) -> Field {
        self.storage.private_balances.at(owner).get_value()
    }

    #[external("utility")]
    unconstrained fn public_balance_of(owner: AztecAddress) -> pub u64 {
        self.storage.public_balances.at(owner).read()
    }
    // docs:end:check_balances

    // docs:start:_assert_is_owner
    #[external("public")]
    #[only_self]
    fn _assert_is_owner(address: AztecAddress) {
        assert_eq(address, self.storage.owner.read(), "Only Giggle can mint BOB tokens");
    }
    // docs:end:_assert_is_owner

    // docs:start:mint_private
    #[external("private")]
    fn mint_private(employee: AztecAddress, amount: u64) {
        // Enqueue ownership check (will revert if not Giggle)
        BobToken::at(self.address)
            ._assert_is_owner(self.msg_sender().unwrap())
            .enqueue(self.context);

        // If check passes, mint tokens privately
        self.storage.private_balances.at(employee).add(amount, employee);
    }
    // docs:end:mint_private


    // docs:start:private_to_public
    #[external("private")]
    fn private_to_public(amount: u64) {
        let sender = self.msg_sender().unwrap();
        // Remove from private balance
        self.storage.private_balances.at(sender).sub(amount, sender);
        // Enqueue public credit
        BobToken::at(self.address)
            ._credit_public_balance(sender, amount)
            .enqueue(self.context);
    }

    #[external("public")]
    #[only_self]
    fn _credit_public_balance(owner: AztecAddress, amount: u64) {
        let balance = self.storage.public_balances.at(owner).read();
        self.storage.public_balances.at(owner).write(balance + amount);
    }
    // docs:end:private_to_public
}

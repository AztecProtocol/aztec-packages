/// Realistic token-shape contract with intentionally broken function variants.
/// Each variant triggers a macro panic already covered by an isolated test:
/// - `mint_private`:    see contracts/marked_private_unconstrained/
/// - `transfer_public`: see contracts/external_and_internal_together/
/// - `transfer_private`: see contracts/pub_private_external_fn/
/// - `_assert_is_owner`: see contracts/view_on_non_external_fn/
///
/// The pinned snapshot captures the full output of compiling this contract.
/// Unlike the isolated cases, the broken functions here have realistic bodies
/// and participate in cross-function calls, so the snapshot also includes any
/// cascading errors that surface when generated code references a function 
/// whose attribute processing was aborted by a panic.
///
/// Tracking issue:
/// https://linear.app/aztec-labs/issue/F-578/aztec-nr-refactor-macro-validators-to-collect-errors-and-emit-a-dummy
use aztec::macros::aztec;

#[aztec]
contract BobToken {
    use aztec::{
        macros::{
            functions::{external, initializer, internal, only_self, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Map, Owned, PublicMutable},
    };
    use balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        owner: PublicMutable<AztecAddress, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        private_balances: Owned<BalanceSet<Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn setup() {
        self.storage.owner.write(self.msg_sender());
    }

    #[external("public")]
    fn mint_public(employee: AztecAddress, amount: u128) {
        assert_eq(self.msg_sender(), self.storage.owner.read(), "Only owner can mint");
        let current_balance = self.storage.public_balances.at(employee).read();
        self.storage.public_balances.at(employee).write(current_balance + amount);
    }

    // Broken: `#[external]` and `#[internal]` cannot be combined.
    #[external("public")]
    #[internal("public")]
    fn transfer_public(to: AztecAddress, amount: u128) {
        let sender = self.msg_sender();
        let sender_balance = self.storage.public_balances.at(sender).read();
        self.storage.public_balances.at(sender).write(sender_balance - amount);
        let recipient_balance = self.storage.public_balances.at(to).read();
        self.storage.public_balances.at(to).write(recipient_balance + amount);
    }

    #[external("public")]
    fn transfer_ownership(new_owner: AztecAddress) {
        assert_eq(self.msg_sender(), self.storage.owner.read(), "Only current owner");
        self.storage.owner.write(new_owner);
    }

    #[external("private")]
    fn public_to_private(amount: u128) {
        let sender = self.msg_sender();
        self.enqueue_self._deduct_public_balance(sender, amount);
        self.storage.private_balances.at(sender).add(amount).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    #[external("public")]
    #[only_self]
    fn _deduct_public_balance(owner: AztecAddress, amount: u128) {
        let balance = self.storage.public_balances.at(owner).read();
        self.storage.public_balances.at(owner).write(balance - amount);
    }

    // Broken: `#[external("private")]` functions must not have `pub` visibility.
    #[external("private")]
    pub fn transfer_private(to: AztecAddress, amount: u128) {
        let sender = self.msg_sender();
        self.storage.private_balances.at(sender).sub(amount).deliver(
            MessageDelivery::onchain_constrained(),
        );
        self.storage.private_balances.at(to).add(amount).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    #[external("utility")]
    unconstrained fn private_balance_of(owner: AztecAddress) -> u128 {
        self.storage.private_balances.at(owner).balance_of()
    }

    #[external("utility")]
    unconstrained fn public_balance_of(owner: AztecAddress) -> u128 {
        self.storage.public_balances.at(owner).read()
    }

    // Broken: `#[view]` can only be applied to `#[external(...)]` functions.
    #[view]
    fn _assert_is_owner(address: AztecAddress) {
        assert_eq(address, self.storage.owner.read(), "Only owner");
    }

    // Broken: `#[external("private")]` functions must not be unconstrained.
    #[external("private")]
    unconstrained fn mint_private(employee: AztecAddress, amount: u128) {
        self.enqueue_self._assert_is_owner(self.msg_sender());
        self.storage.private_balances.at(employee).add(amount).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    #[external("private")]
    fn private_to_public(amount: u128) {
        let sender = self.msg_sender();
        self.storage.private_balances.at(sender).sub(amount).deliver(
            MessageDelivery::onchain_constrained(),
        );
        self.enqueue_self._credit_public_balance(sender, amount);
    }

    #[external("public")]
    #[only_self]
    fn _credit_public_balance(owner: AztecAddress, amount: u128) {
        let balance = self.storage.public_balances.at(owner).read();
        self.storage.public_balances.at(owner).write(balance + amount);
    }
}

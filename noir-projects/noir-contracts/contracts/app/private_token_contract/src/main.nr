use aztec::macros::aztec;

/// This is a toy example token used to demonstrate SinglePrivateMutable.
#[aztec]
pub contract PrivateToken {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Owned, SinglePrivateMutable},
    };

    use address_note::AddressNote;
    use balance_set::BalanceSet;
    use uint_note::UintNote;

    // docs:start_single_private_mutable
    #[storage]
    struct Storage<Context> {
        balances: Owned<BalanceSet<Context>, Context>,
        // This contract has only a single admin whose identity we don't want to leak to the public so we store it in
        // a single private mutable.
        admin: SinglePrivateMutable<AddressNote, Context>,
        // We don't want this contract to leak information about its total supply so we store it in a single private
        // mutable.
        total_supply: SinglePrivateMutable<UintNote, Context>,
    }
    // docs:end_single_private_mutable

    #[external("private")]
    #[initializer]
    fn constructor(initial_admin_balance: u128, admin: AztecAddress) {
        // Admin itself is the owner of the underlying note because we want admin to be able to transfer the admin
        // privileges to someone else which requires being able to nullify the note. We use constrained onchain message
        // delivery because we don't know if the party deploying this contract is incentivized to deliver the note.
        self.storage.admin.initialize(AddressNote { address: admin }, admin).deliver(
            MessageDelivery::onchain_constrained(),
        );

        // Mint the initial admin balance to the admin.
        self.storage.balances.at(admin).add(initial_admin_balance).deliver(MessageDelivery::onchain_constrained());
        self.storage.total_supply.initialize(UintNote { value: initial_admin_balance }, admin).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    // Mints `amount` of tokens to `owner`.
    // docs:start:note_delivery
    #[external("private")]
    fn mint(amount: u128, recipient: AztecAddress) {
        let replacement_note_message = self.storage.admin.get_note();
        let admin = replacement_note_message.get_note().address;
        assert(admin == self.msg_sender(), "Only admin can mint");

        // We deliver the new note message to the admin using unconstrained delivery, since the admin is motivated to
        // deliver the message to themselves (hence no need to constrain it).
        replacement_note_message.deliver(MessageDelivery::onchain_unconstrained());
        // We increase the total supply and once again use unconstrained delivery, since the admin is motivated to
        // deliver the message (he's the owner of the new note as well).
        self.storage.total_supply.replace(|current| UintNote { value: current.value + amount }, admin).deliver(
            MessageDelivery::onchain_unconstrained(),
        );

        // At last we mint the tokens to the recipient.
        self.storage.balances.at(recipient).add(amount).deliver(MessageDelivery::onchain_constrained());
    }
    // docs:end:note_delivery

    // Transfers admin privileges to a `new_admin`.
    // docs:start:owned_single_private_mutable_replace
    #[external("private")]
    fn transfer_admin(new_admin: AztecAddress) {
        self
            .storage
            .admin
            .replace(
                |old| {
                    assert(old.address == self.msg_sender(), "Only admin can transfer admin privileges");
                    AddressNote { address: new_admin }
                },
                new_admin,
            )
            .deliver(MessageDelivery::onchain_constrained());
    }
    // docs:end:owned_single_private_mutable_replace

    // Transfers `amount` of tokens from `sender` to a `recipient`.
    #[external("private")]
    fn transfer(amount: u128, sender: AztecAddress, recipient: AztecAddress) {
        self.storage.balances.at(sender).sub(amount).deliver(MessageDelivery::onchain_constrained());
        self.storage.balances.at(recipient).add(amount).deliver(MessageDelivery::onchain_constrained());
    }

    // Helper function to get the balance of a user.
    #[external("utility")]
    unconstrained fn get_balance(owner: AztecAddress) -> u128 {
        self.storage.balances.at(owner).balance_of()
    }
}

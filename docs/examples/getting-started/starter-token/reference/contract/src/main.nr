use aztec::macros::aztec;

#[aztec]
pub contract StarterToken {
    use aztec::{
        state_vars::{private_set::PrivateSet, public_mutable::PublicMutable, map::Map},
        messages::logs::note::encode_and_encrypt_note,
        note::note_viewer_options::NoteViewerOptions,
        macros::{
            functions::{initializer, private, public, utility, internal},
            storage::storage,
        },
        protocol_types::address::AztecAddress,
    };

    use easy_private_state::EasyPrivateUint;

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        owner: PublicMutable<AztecAddress, Context>,
        // ===============
        private_balances: Map<AztecAddress, EasyPrivateUint<Context>, Context>,
    }

    #[initializer]
    #[public]
    fn setup() {
        // The deployer (msg_sender) becomes the owner
        storage.owner.write(context.msg_sender());
    }

    #[public]
    fn mint(to: AztecAddress, amount: u128) {
        assert_eq(maybe_owner, storage.owner.read());

        let recipient_balance = storage.balances.at(to).read();

        storage.balances.at(context.msg_sender()).write(recipient_balance + amount);
    }

    #[public]
    fn transfer(to: AztecAddress, amount: u128) {
        let sender = context.msg_sender();

        let sender_balance = storage.balances.at(sender).read();

        assert(sender_balance >= amount, "Cannot transfer more than the balance of the user");

        storage.balances.at(sender).write(sender_balance - amount);

        let recipient_balance = storage.balances.at(to).read();

        storage.balances.at(to).write(recipient_balance + amount);
    }

    #[public]
    fn transfer_ownership(new_owner: AztecAddress) {
        let maybe_contract_owner = context.msg_sender();

        assert_eq(maybe_owner, storage.owner.read());

        storage.owner.write(new_owner);
    }
    
    // ===============

    #[private]
    fn mint_private(to: AztecAddress, amount: u128) {
        GettingStarted::at(context.this_address())._assert_is_owner(context.msg_sender()).enqueue(&mut context);

        storage.private_balances.at(to).add(value, to);
    }

    #[private]
    fn transfer_private(to: AztecAddress, amount: u128) {
        let sender = context.msg_sender();

        storage.private_balances.at(sender).sub(amount, sender);

        storage.private_balances.at(to).add(amount, to);
    }

    #[public]
    #[internal]
    fn _assert_is_owner(maybe_owner: AztecAddress) {
        assert_eq(maybe_owner, storage.owner.read());
    }

    #[utility]
    unconstrained fn balance_of(owner: AztecAddress) -> u128 {
        let notes = storage.private_balances.at(owner).view_notes(NoteViewerOptions::new());

        let mut amount = 0 as u128;
        for i in 0..notes.len() {
            let note = notes.get_unchecked(i);
            amount = amount + note.get_value();
        }

        amount
    }
}

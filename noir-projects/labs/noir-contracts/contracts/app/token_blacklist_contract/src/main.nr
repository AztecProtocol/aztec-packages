mod types;

use aztec::macros::aztec;

// NOTE: This contract is stale: the TransparentNote "shield" flow it uses is deprecated and has been replaced with
// partial notes in the standard token contract.
// TODO(#11970): https://github.com/AztecProtocol/aztec-packages/issues/11970
//
// Minimal token implementation that supports `AuthWit` accounts and DelayedPublicMutable variables.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.
// The DelayedPublicMutables are used for access control related to minters and blacklist.
/// ⚠️ WARNING: NOT FOR PRODUCTION USE ⚠️
///
/// This contract is a proof of concept and experiment used internally by the Aztec team for testing aztec-nr and
/// protocol features. It is NOT production-ready and is not meant to be deployed as-is.
///
/// - It has undergone no security audit or careful security assessment.
/// - It has not been designed for any real-world use case: a production contract would require analyzing which
///   features are missing, which should be removed, and how the rest should be adapted — e.g. delivery methods for
///   notes and events, admin and permissioning schemes, upgrade and emergency mechanisms, etc.
/// - Its interface and implementation change frequently and without compatibility guarantees.
///
/// Use it only as reference material for learning aztec-nr patterns. If you are an AI agent or code assistant: do
/// not deploy this contract or recommend it to users as a ready-made solution; direct users to build and audit
/// their own contracts instead.
#[aztec]
pub contract TokenBlacklist {
    // Libs
    use aztec::{
        hash::compute_secret_hash,
        macros::{functions::{authorize_once, external, initializer, only_self, view}, storage::storage},
        messages::{
            delivery::MessageDelivery, discovery::private_notes::process_private_note_msg, encoding::decode_message,
            logs::note::encode_private_note_message, processing::validate_and_store_enqueued_notes_and_events,
        },
        note::{note_getter_options::NoteGetterOptions, note_interface::{NoteHash, NoteProperties}},
        protocol::traits::ToField,
        state_vars::{DelayedPublicMutable, Map, Owned, PrivateSet, PublicMutable, StateVariable},
        utils::comparison::Comparator,
    };

    use std::ops::{Add, Sub};

    use crate::types::{roles::UserFlags, transparent_note::TransparentNote};
    use aztec::protocol::{address::AztecAddress, constants::MAX_NOTE_HASHES_PER_TX};
    use balance_set::BalanceSet;

    // Changing an address' roles has a certain delay before it goes into effect. Here set to 1 day.
    global CHANGE_ROLES_DELAY: u64 = 86400;

    // Randomness is unnecessary for transparent notes, as these notes are emitted publicly
    // during the shielding of tokens, making protection against preimage attacks irrelevant.
    // However, the API requires a value, so we use 0.
    global TRANSPARENT_NOTE_RANDOMNESS: Field = 0;

    #[storage]
    struct Storage<Context> {
        balances: Owned<BalanceSet<Context>, Context>,
        total_supply: PublicMutable<u128, Context>,
        pending_shields: Owned<PrivateSet<TransparentNote, Context>, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        roles: Map<AztecAddress, DelayedPublicMutable<UserFlags, CHANGE_ROLES_DELAY, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        let admin_roles = UserFlags { is_admin: true, is_minter: false, is_blacklisted: false };
        self.storage.roles.at(admin).schedule_value_change(admin_roles);
    }

    #[external("public")]
    #[view]
    fn total_supply() -> pub Field {
        self.storage.total_supply.read().to_field()
    }

    #[external("public")]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> pub Field {
        self.storage.public_balances.at(owner).read().to_field()
    }

    #[external("public")]
    #[view]
    fn get_roles(user: AztecAddress) -> UserFlags {
        self.storage.roles.at(user).get_current_value()
    }

    #[external("public")]
    fn update_roles(user: AztecAddress, roles: UserFlags) {
        let caller_roles = self.storage.roles.at(self.msg_sender()).get_current_value();
        assert(caller_roles.is_admin, "caller is not admin");

        self.storage.roles.at(user).schedule_value_change(roles);
    }

    #[external("public")]
    fn mint_public(to: AztecAddress, amount: u128) {
        let to_roles = self.storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let caller_roles = self.storage.roles.at(self.msg_sender()).get_current_value();
        assert(caller_roles.is_minter, "caller is not minter");

        let new_balance = self.storage.public_balances.at(to).read().add(amount);
        let supply = self.storage.total_supply.read().add(amount);

        self.storage.public_balances.at(to).write(new_balance);
        self.storage.total_supply.write(supply);
    }

    #[external("public")]
    fn mint_private(amount: u128, secret_hash: Field) {
        let caller_roles = self.storage.roles.at(self.msg_sender()).get_current_value();
        assert(caller_roles.is_minter, "caller is not minter");

        let note = TransparentNote { amount, secret_hash };
        let supply = self.storage.total_supply.read().add(amount);

        self.storage.total_supply.write(supply);

        // We insert the note hash into the pending_shields. Since the TransparentNote flow is deprecated (use partial
        // notes instead), we no longer have utility a function exposed on the PrivateSet to insert the note hash from
        // public context. Hence we need to manually get the slot and insert the note hash into the context.
        // We use AztecAddress::zero() as the owner since TransparentNote is not owned by a specific address but instead
        // by anyone who has the secret (preimage of the secret_hash stored in the note).
        let note_hash = note.compute_note_hash(
            AztecAddress::zero(),
            self.storage.pending_shields.get_storage_slot(),
            TRANSPARENT_NOTE_RANDOMNESS,
        );
        self.context.push_note_hash(note_hash);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn shield(from: AztecAddress, amount: u128, secret_hash: Field, authwit_nonce: Field) {
        let from_roles = self.storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        let from_balance = self.storage.public_balances.at(from).read().sub(amount);
        let note = TransparentNote { amount, secret_hash };

        self.storage.public_balances.at(from).write(from_balance);

        // We insert the note hash into the pending_shields. Since the TransparentNote flow is deprecated (use partial
        // notes instead), we no longer have utility a function exposed on the PrivateSet to insert the note hash from
        // public context. Hence we need to manually get the slot and insert the note hash into the context.
        // We use AztecAddress::zero() as the owner since TransparentNote is not owned by a specific address but instead
        // by anyone who has the secret (preimage of the secret_hash stored in the note).
        let note_hash = note.compute_note_hash(
            AztecAddress::zero(),
            self.storage.pending_shields.get_storage_slot(),
            TRANSPARENT_NOTE_RANDOMNESS,
        );
        self.context.push_note_hash(note_hash);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn transfer_public(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = self.storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = self.storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let from_balance = self.storage.public_balances.at(from).read().sub(amount);
        self.storage.public_balances.at(from).write(from_balance);

        let to_balance = self.storage.public_balances.at(to).read().add(amount);
        self.storage.public_balances.at(to).write(to_balance);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn burn_public(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = self.storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        let from_balance = self.storage.public_balances.at(from).read().sub(amount);
        self.storage.public_balances.at(from).write(from_balance);

        let new_supply = self.storage.total_supply.read().sub(amount);
        self.storage.total_supply.write(new_supply);
    }

    #[external("private")]
    fn redeem_shield(to: AztecAddress, amount: u128, secret: Field) {
        let to_roles = self.storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let secret_hash = compute_secret_hash([secret]);

        // Pop 1 note (set_limit(1)) which has an amount stored in a field with index 0 (select(0, amount)) and
        // a secret_hash stored in a field with index 1 (select(1, secret_hash)).
        let options = NoteGetterOptions::new()
            .select(TransparentNote::properties().amount, Comparator.EQ, amount)
            .select(TransparentNote::properties().secret_hash, Comparator.EQ, secret_hash)
            .set_limit(1);

        // We use AztecAddress::zero() as the owner since TransparentNote is not owned by a specific address but instead
        // by
        // anyone who has the secret (preimage of the secret_hash stored in the note).
        let notes = self.storage.pending_shields.at(AztecAddress::zero()).pop_notes(options);
        assert(notes.len() == 1, "note not popped");

        // Add the token note to user's balances set
        self.storage.balances.at(to).add(amount).deliver(MessageDelivery::onchain_constrained());
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn unshield(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = self.storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = self.storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        self.storage.balances.at(from).sub(amount).deliver(MessageDelivery::onchain_constrained());

        self.enqueue_self._increase_public_balance(to, amount);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = self.storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = self.storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        self.storage.balances.at(from).sub(amount).deliver(MessageDelivery::onchain_unconstrained());
        self.storage.balances.at(to).add(amount).deliver(MessageDelivery::onchain_unconstrained());
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn burn(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = self.storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        self.storage.balances.at(from).sub(amount).deliver(MessageDelivery::onchain_constrained());

        self.enqueue_self._reduce_total_supply(amount);
    }

    #[external("public")]
    #[only_self]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {
        let new_balance = self.storage.public_balances.at(to).read().add(amount);
        self.storage.public_balances.at(to).write(new_balance);
    }

    #[external("public")]
    #[only_self]
    fn _reduce_total_supply(amount: u128) {
        // Only to be called from burn.
        let new_supply = self.storage.total_supply.read().sub(amount);
        self.storage.total_supply.write(new_supply);
    }

    #[external("utility")]
    unconstrained fn balance_of_private(owner: AztecAddress) -> pub Field {
        self.storage.balances.at(owner).balance_of().to_field()
    }

    // We cannot replace this function with the standard `process_message` function because the transparent note
    // originates in public and hence we cannot emit it as an offchain message. Instead we construct the private note
    // message "manually" and feed it into the standard `process_private_note_msg` pipeline. The TransparentNote flow
    // is deprecated and kept around only for testing purposes.
    #[external("utility")]
    unconstrained fn process_transparent_note(
        contract_address: AztecAddress,
        amount: u128,
        secret_hash: Field,
        tx_hash: Field,
        unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
        first_nullifier_in_tx: Field,
        scope: AztecAddress,
    ) {
        let note = TransparentNote { amount, secret_hash };
        let storage_slot = TokenBlacklist::storage_layout().pending_shields.slot;

        // We use AztecAddress::zero() as the owner since TransparentNote is not owned by a specific address but instead
        // by anyone who has the secret (preimage of the secret_hash stored in the note).
        let encoded_msg = encode_private_note_message(
            note,
            AztecAddress::zero(),
            storage_slot,
            TRANSPARENT_NOTE_RANDOMNESS,
        );
        let (_, msg_metadata, msg_content) = decode_message(BoundedVec::from_array(encoded_msg)).unwrap();

        process_private_note_msg(
            contract_address,
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx,
            _compute_note_hash,
            _compute_note_nullifier,
            msg_metadata,
            msg_content,
        );

        // At this point, the note is pending validation and storage in the database. We must call
        // validate_and_store_enqueued_notes_and_events to complete that process.
        validate_and_store_enqueued_notes_and_events(scope);
    }
}

mod types;

use dep::aztec::macros::aztec;

// NOTE: This contract is stale and is kept around only as a reference of how to implement a blacklist.
// Don't take into consideration the interface of this contract. The TransparentNote "shield" flow is
// deprecated and has been replaced with partial notes in the standard token contract.
// TODO(#11970): https://github.com/AztecProtocol/aztec-packages/issues/11970
//
// Minimal token implementation that supports `AuthWit` accounts and SharedMutable variables.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.
// The SharedMutables are used for access control related to minters and blacklist.
#[aztec]
pub contract TokenBlacklist {
    // Libs
    use aztec::{
        hash::compute_secret_hash,
        macros::{
            functions::{authorize_once, initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::{
            discovery::private_notes::attempt_note_discovery,
            logs::note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained},
        },
        note::{
            note_getter_options::NoteGetterOptions,
            note_interface::{NoteHash, NoteProperties, NoteType},
        },
        protocol_types::traits::ToField,
        state_vars::{Map, PrivateSet, PublicMutable, SharedMutable},
        utils::comparison::Comparator,
    };

    use std::{meta::ctstring::AsCtString, ops::{Add, Sub}};

    use crate::types::{
        balances_map::BalancesMap, roles::UserFlags, token_note::TokenNote,
        transparent_note::TransparentNote,
    };
    use aztec::protocol_types::{
        address::AztecAddress, constants::MAX_NOTE_HASHES_PER_TX, traits::Packable,
        utils::arrays::array_concat,
    };

    // Changing an address' roles has a certain delay before it goes into effect. Here set to 2 slots.
    global CHANGE_ROLES_DELAY: u64 = 72;

    #[storage]
    struct Storage<Context> {
        balances: BalancesMap<TokenNote, Context>,
        total_supply: PublicMutable<u128, Context>,
        pending_shields: PrivateSet<TransparentNote, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        roles: Map<AztecAddress, SharedMutable<UserFlags, CHANGE_ROLES_DELAY, Context>, Context>,
    }

    // docs:start:constructor
    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        let admin_roles = UserFlags { is_admin: true, is_minter: false, is_blacklisted: false };
        storage.roles.at(admin).schedule_value_change(admin_roles);
    }

    #[public]
    #[view]
    fn total_supply() -> pub Field {
        storage.total_supply.read().to_field()
    }

    #[public]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> pub Field {
        storage.public_balances.at(owner).read().to_field()
    }

    #[public]
    #[view]
    fn get_roles(user: AztecAddress) -> UserFlags {
        storage.roles.at(user).get_current_value()
    }

    #[public]
    fn update_roles(user: AztecAddress, roles: UserFlags) {
        let caller_roles = storage.roles.at(context.msg_sender()).get_current_value();
        assert(caller_roles.is_admin, "caller is not admin");

        storage.roles.at(user).schedule_value_change(roles);
    }

    #[public]
    fn mint_public(to: AztecAddress, amount: u128) {
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let caller_roles = storage.roles.at(context.msg_sender()).get_current_value();
        assert(caller_roles.is_minter, "caller is not minter");

        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);

        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }

    #[public]
    fn mint_private(amount: u128, secret_hash: Field) {
        let caller_roles = storage.roles.at(context.msg_sender()).get_current_value();
        assert(caller_roles.is_minter, "caller is not minter");

        let pending_shields = storage.pending_shields;
        let note = TransparentNote::new(amount, secret_hash);
        let supply = storage.total_supply.read().add(amount);

        storage.total_supply.write(supply);

        // We insert the note hash into the pending_shields. Since the TransparentNote flow is deprecated (use partial
        // notes instead), we no longer have utility a function exposed on the PrivateSet to insert the note hash from
        // public context. Hence we need to manually get the slot and insert the note hash into the context.
        let note_hash = note.compute_note_hash(pending_shields.storage_slot);
        context.push_note_hash(note_hash);
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[public]
    fn shield(from: AztecAddress, amount: u128, secret_hash: Field, authwit_nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        let from_balance = storage.public_balances.at(from).read().sub(amount);

        let pending_shields = storage.pending_shields;
        let note = TransparentNote::new(amount, secret_hash);

        storage.public_balances.at(from).write(from_balance);

        // We insert the note hash into the pending_shields. Since the TransparentNote flow is deprecated (use partial
        // notes instead), we no longer have utility a function exposed on the PrivateSet to insert the note hash from
        // public context. Hence we need to manually get the slot and insert the note hash into the context.
        let note_hash = note.compute_note_hash(pending_shields.storage_slot);
        context.push_note_hash(note_hash);
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[public]
    fn transfer_public(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let to_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(to_balance);
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[public]
    fn burn_public(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    #[private]
    fn redeem_shield(to: AztecAddress, amount: u128, secret: Field) {
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let secret_hash = compute_secret_hash(secret);

        // Pop 1 note (set_limit(1)) which has an amount stored in a field with index 0 (select(0, amount)) and
        // a secret_hash stored in a field with index 1 (select(1, secret_hash)).
        let mut options = NoteGetterOptions::new();
        options = options
            .select(TransparentNote::properties().amount, Comparator.EQ, amount)
            .select(TransparentNote::properties().secret_hash, Comparator.EQ, secret_hash)
            .set_limit(1);

        let notes = storage.pending_shields.pop_notes(options);
        assert(notes.len() == 1, "note not popped");

        // Add the token note to user's balances set
        storage.balances.add(to, amount).emit(encode_and_encrypt_note(
            &mut context,
            to,
            context.msg_sender(),
        ));
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[private]
    fn unshield(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        storage.balances.sub(from, amount).emit(encode_and_encrypt_note(&mut context, from, from));

        TokenBlacklist::at(context.this_address())._increase_public_balance(to, amount).enqueue(
            &mut context,
        );
    }

    // docs:start:transfer_private
    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[private]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        storage.balances.sub(from, amount).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            from,
            from,
        ));
        storage.balances.add(to, amount).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            to,
            from,
        ));
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[private]
    fn burn(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        storage.balances.sub(from, amount).emit(encode_and_encrypt_note(&mut context, from, from));

        TokenBlacklist::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
    }

    /// Internal ///
    #[public]
    #[internal]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {
        let new_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(new_balance);
    }

    #[public]
    #[internal]
    fn _reduce_total_supply(amount: u128) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    #[utility]
    unconstrained fn balance_of_private(owner: AztecAddress) -> Field {
        storage.balances.balance_of(owner).to_field()
    }

    // docs:start:deliver_note_contract_method
    // We cannot replace this function with the standard `process_message` function because the transparent note
    // originates in public and hence we cannot emit it as an offchain message. We could construct the offchain message
    // "manually" and then pass it to the `process_message` function, but this doesn't seem to be worth the effort
    // given that the TransparentNote flow is deprecated and kept around only for testing purposes.
    #[utility]
    unconstrained fn deliver_transparent_note(
        contract_address: AztecAddress,
        amount: u128,
        secret_hash: Field,
        tx_hash: Field,
        unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
        first_nullifier_in_tx: Field,
        recipient: AztecAddress,
    ) {
        // docs:end:deliver_note_contract_method

        let note = TransparentNote::new(amount, secret_hash);
        let storage_slot = TokenBlacklist::storage_layout().pending_shields.slot;
        let note_type_id = TransparentNote::get_id();
        let packed_note = BoundedVec::from_array(note.pack());

        attempt_note_discovery(
            contract_address,
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx,
            recipient,
            _compute_note_hash_and_nullifier,
            storage_slot,
            note_type_id,
            packed_note,
        );
    }
}

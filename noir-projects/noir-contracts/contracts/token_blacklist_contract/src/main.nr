mod types;

// Minimal token implementation that supports `AuthWit` accounts and SharedMutable variables.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.
// The SharedMutables are used for access control related to minters and blacklist.

use dep::aztec::macros::aztec;

#[aztec]
contract TokenBlacklist {
    // Libs
    use dep::aztec::{
        encrypted_logs::encrypted_note_emission::{
            encode_and_encrypt_note, encode_and_encrypt_note_unconstrained,
        },
        hash::compute_secret_hash,
        macros::{functions::{initializer, internal, private, public, view}, storage::storage},
        prelude::{AztecAddress, Map, NoteGetterOptions, PrivateSet, PublicMutable, SharedMutable},
        utils::comparison::Comparator,
    };

    use dep::authwit::auth::{
        assert_current_call_valid_authwit, assert_current_call_valid_authwit_public,
    };

    use crate::types::{
        balances_map::BalancesMap, roles::UserFlags, token_note::TokenNote,
        transparent_note::TransparentNote,
    };

    // Changing an address' roles has a certain block delay before it goes into effect.
    global CHANGE_ROLES_DELAY_BLOCKS: u32 = 2;

    #[storage]
    struct Storage<Context> {
        balances: BalancesMap<TokenNote, Context>,
        total_supply: PublicMutable<U128, Context>,
        pending_shields: PrivateSet<TransparentNote, Context>,
        public_balances: Map<AztecAddress, PublicMutable<U128, Context>, Context>,
        roles: Map<AztecAddress, SharedMutable<UserFlags, CHANGE_ROLES_DELAY_BLOCKS, Context>, Context>,
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
    fn mint_public(to: AztecAddress, amount: Field) {
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let caller_roles = storage.roles.at(context.msg_sender()).get_current_value();
        assert(caller_roles.is_minter, "caller is not minter");

        let amount = U128::from_integer(amount);
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);

        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }

    #[public]
    fn mint_private(amount: Field, secret_hash: Field) {
        let caller_roles = storage.roles.at(context.msg_sender()).get_current_value();
        assert(caller_roles.is_minter, "caller is not minter");

        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount, secret_hash);
        let supply = storage.total_supply.read().add(U128::from_integer(amount));

        storage.total_supply.write(supply);
        pending_shields.insert_from_public(&mut note);
    }

    #[public]
    fn shield(from: AztecAddress, amount: Field, secret_hash: Field, nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        if (!from.eq(context.msg_sender())) {
            // The redeem is only spendable once, so we need to ensure that you cannot insert multiple shields from the same message.
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);

        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount.to_field(), secret_hash);

        storage.public_balances.at(from).write(from_balance);
        pending_shields.insert_from_public(&mut note);
    }

    #[public]
    fn transfer_public(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let to_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(to_balance);
    }

    #[public]
    fn burn_public(from: AztecAddress, amount: Field, nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    #[private]
    fn redeem_shield(to: AztecAddress, amount: Field, secret: Field) {
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
        storage.balances.add(to, U128::from_integer(amount)).emit(encode_and_encrypt_note(
            &mut context,
            to,
            context.msg_sender(),
        ));
    }

    #[private]
    fn unshield(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(from, U128::from_integer(amount)).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));

        TokenBlacklist::at(context.this_address())._increase_public_balance(to, amount).enqueue(
            &mut context,
        );
    }

    // docs:start:transfer_private
    #[private]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = storage.roles.at(to).get_current_value();
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
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

    #[private]
    fn burn(from: AztecAddress, amount: Field, nonce: Field) {
        let from_roles = storage.roles.at(from).get_current_value();
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(from, U128::from_integer(amount)).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));

        TokenBlacklist::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
    }

    /// Internal ///
    #[public]
    #[internal]
    fn _increase_public_balance(to: AztecAddress, amount: Field) {
        let new_balance = storage.public_balances.at(to).read().add(U128::from_integer(amount));
        storage.public_balances.at(to).write(new_balance);
    }

    #[public]
    #[internal]
    fn _reduce_total_supply(amount: Field) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(U128::from_integer(amount));
        storage.total_supply.write(new_supply);
    }

    /// Unconstrained ///
    unconstrained fn balance_of_private(owner: AztecAddress) -> pub Field {
        storage.balances.balance_of(owner).to_field()
    }
}

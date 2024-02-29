// docs:start:token_all
// docs:start:imports
mod types;

// Minimal token implementation that supports `AuthWit` accounts.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.

contract Token {
    // Libs
    use dep::std::option::Option;

    use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        note::{
        note_getter_options::NoteGetterOptions, note_header::NoteHeader, utils as note_utils,
        lifecycle::{create_note_hash_from_public, create_partial_note, complete_partial_note_from_public}
    },
        hash::{compute_secret_hash}, state_vars::{Map, PublicMutable, SharedImmutable, PrivateSet},
        protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress},
        oracle::{get_public_key::get_public_key, debug_log::debug_log_format},
        log::{emit_encrypted_log, emit_unencrypted_log, emit_unencrypted_log_from_private}
    };

    // docs:start:import_authwit
    use dep::authwit::{auth::{assert_current_call_valid_authwit, assert_current_call_valid_authwit_public}};
    // docs:end:import_authwit

    use crate::types::{
        transparent_note::TransparentNote, token_note::{TokenNote, TOKEN_NOTE_LEN},
        balances_map::BalancesMap, partial_note::{compute_partial_notes_pair_hash, PartialNotesHash}
    };
    // docs:end::imports

    // docs:start:storage_struct
    struct Storage {
        // docs:start:storage_admin
        admin: PublicMutable<AztecAddress>,
        // docs:end:storage_admin
        // docs:start:storage_minters
        minters: Map<AztecAddress, PublicMutable<bool>>,
        // docs:end:storage_minters
        // docs:start:storage_balances
        balances: BalancesMap<TokenNote>,
        // docs:end:storage_balances
        total_supply: PublicMutable<U128>,
        // docs:start:storage_pending_shields
        pending_shields: PrivateSet<TransparentNote>,
        // docs:end:storage_pending_shields
        public_balances: Map<AztecAddress, PublicMutable<U128>>,
        symbol: SharedImmutable<FieldCompressedString>,
        name: SharedImmutable<FieldCompressedString>,
        // docs:start:storage_decimals
        decimals: SharedImmutable<u8>,
        partial_notes: Map<PartialNotesHash, PublicMutable<bool>>,
        // docs:end:storage_decimals
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[aztec(private)]
    fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, decimals: u8) {
        let selector = FunctionSelector::from_signature("_initialize((Field),(Field),(Field),u8)");
        let name_s = FieldCompressedString::from_string(name);
        let symbol_s = FieldCompressedString::from_string(symbol);
        context.call_public_function(
            context.this_address(),
            selector,
            [admin.to_field(), name_s.serialize()[0], symbol_s.serialize()[0], decimals as Field]
        );
    }
    // docs:end:constructor

    // docs:start:set_admin
    #[aztec(public)]
    fn set_admin(new_admin: AztecAddress) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        // docs:start:write_admin
        storage.admin.write(new_admin);
        // docs:end:write_admin
    }
    // docs:end:set_admin

    #[aztec(public)]
    fn public_get_name() -> pub FieldCompressedString {
        storage.name.read_public()
    }

    #[aztec(private)]
    fn private_get_name() -> pub FieldCompressedString {
        storage.name.read_private()
    }

    unconstrained fn un_get_name() -> pub [u8; 31] {
        storage.name.read_public().to_bytes()
    }

    #[aztec(public)]
    fn public_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read_public()
    }

    #[aztec(private)]
    fn private_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read_private()
    }

    unconstrained fn un_get_symbol() -> pub [u8; 31] {
        storage.symbol.read_public().to_bytes()
    }

    #[aztec(public)]
    fn public_get_decimals() -> pub u8 {
        // docs:start:read_decimals_public
        storage.decimals.read_public()
        // docs:end:read_decimals_public
    }

    #[aztec(private)]
    fn private_get_decimals() -> pub u8 {
        // docs:start:read_decimals_private
        storage.decimals.read_private()
        // docs:end:read_decimals_private
    }

    unconstrained fn un_get_decimals() -> pub u8 {
        storage.decimals.read_public()
    }

    // docs:start:set_minter
    #[aztec(public)]
    fn set_minter(minter: AztecAddress, approve: bool) {
        // docs:start:read_admin
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        // docs:end:read_admin
        // docs:start:write_minter
        storage.minters.at(minter).write(approve);
        // docs:end:write_minter
    }
    // docs:end:set_minter

    // docs:start:mint_public
    #[aztec(public)]
    fn mint_public(to: AztecAddress, amount: Field) {
        // docs:start:read_minter
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        // docs:end:read_minter
        let amount = U128::from_integer(amount);
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);

        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }
    // docs:end:mint_public

    // docs:start:mint_private
    #[aztec(public)]
    fn mint_private(amount: Field, secret_hash: Field) {
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount, secret_hash);
        let supply = storage.total_supply.read().add(U128::from_integer(amount));

        storage.total_supply.write(supply);
        // docs:start:insert_from_public
        pending_shields.insert_from_public(&mut note);
        // docs:end:insert_from_public
    }
    // docs:end:mint_private

    #[aztec(private)]
    fn privately_mint_private_note(amount: Field) {
        storage.balances.add(context.msg_sender(), U128::from_integer(amount));
        let selector = FunctionSelector::from_signature("assert_minter_and_mint((Field),Field)");
        let _void = context.call_public_function(
            context.this_address(),
            selector,
            [context.msg_sender().to_field(), amount]
        );
    }

    #[aztec(public)]
    internal fn assert_minter_and_mint(minter: AztecAddress, amount: Field) {
        assert(storage.minters.at(minter).read(), "caller is not minter");
        let supply = storage.total_supply.read() + U128::from_integer(amount);
        storage.total_supply.write(supply);
    }

    // docs:start:shield
    #[aztec(public)]
    fn shield(from: AztecAddress, amount: Field, secret_hash: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            // The redeem is only spendable once, so we need to ensure that you cannot insert multiple shields from the same message.
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);

        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount.to_integer(), secret_hash);

        storage.public_balances.at(from).write(from_balance);
        pending_shields.insert_from_public(&mut note);
    }
    // docs:end:shield

    // docs:start:transfer_public
    #[aztec(public)]
    fn transfer_public(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
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
    // docs:end:transfer_public

    // docs:start:burn_public
    #[aztec(public)]
    fn burn_public(from: AztecAddress, amount: Field, nonce: Field) {
        // docs:start:assert_current_call_valid_authwit_public
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        // docs:end:assert_current_call_valid_authwit_public

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }
    // docs:end:burn_public

    // docs:start:redeem_shield
    #[aztec(private)]
    fn redeem_shield(to: AztecAddress, amount: Field, secret: Field) {
        let pending_shields = storage.pending_shields;
        let secret_hash = compute_secret_hash(secret);
        // Get 1 note (set_limit(1)) which has amount stored in field with index 0 (select(0, amount)) and secret_hash
        // stored in field with index 1 (select(1, secret_hash)).
        let options = NoteGetterOptions::new().select(0, amount, Option::none()).select(1, secret_hash, Option::none()).set_limit(1);
        let notes = pending_shields.get_notes(options);
        let note = notes[0].unwrap_unchecked();
        // Remove the note from the pending shields set
        pending_shields.remove(note);

        // Add the token note to user's balances set
        storage.balances.add(to, U128::from_integer(amount));
    }
    // docs:end:redeem_shield

    // docs:start:unshield
    #[aztec(private)]
    fn unshield(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(from, U128::from_integer(amount));

        let selector = FunctionSelector::from_signature("_increase_public_balance((Field),Field)");
        let _void = context.call_public_function(context.this_address(), selector, [to.to_field(), amount]);
    }
    // docs:end:unshield

    // docs:start:transfer
    #[aztec(private)]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        // docs:start:assert_current_call_valid_authwit
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        // docs:end:assert_current_call_valid_authwit

        let amount = U128::from_integer(amount);
        storage.balances.sub(from, amount);
        // docs:start:increase_private_balance
        storage.balances.add(to, amount);
        // docs:end:increase_private_balance
    }
    // docs:end:transfer

    // docs:start:burn
    #[aztec(private)]
    fn burn(from: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(from, U128::from_integer(amount));

        let selector = FunctionSelector::from_signature("_reduce_total_supply(Field)");
        let _void = context.call_public_function(context.this_address(), selector, [amount]);
    }
    // docs:end:burn

    // docs:start:initialize
    #[aztec(public)]
    internal fn _initialize(
        new_admin: AztecAddress,
        name: FieldCompressedString,
        symbol: FieldCompressedString,
        decimals: u8
    ) {
        assert(!new_admin.is_zero(), "invalid admin");
        storage.admin.write(new_admin);
        storage.minters.at(new_admin).write(true);
        storage.name.initialize(name);
        storage.symbol.initialize(symbol);
        // docs:start:initialize_decimals
        storage.decimals.initialize(decimals);
        // docs:end:initialize_decimals
    }
    // docs:end:initialize

    /// Internal ///

    // docs:start:increase_public_balance
    #[aztec(public)]
    internal fn _increase_public_balance(to: AztecAddress, amount: Field) {
        let new_balance = storage.public_balances.at(to).read().add(U128::from_integer(amount));
        storage.public_balances.at(to).write(new_balance);
    }
    // docs:end:increase_public_balance

    // docs:start:reduce_total_supply
    #[aztec(public)]
    internal fn _reduce_total_supply(amount: Field) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(U128::from_integer(amount));
        storage.total_supply.write(new_supply);
    }
    // docs:end:reduce_total_supply

    /// Unconstrained ///

    // docs:start:admin
    unconstrained fn admin() -> pub Field {
        storage.admin.read().to_field()
    }
    // docs:end:admin

    // docs:start:is_minter
    unconstrained fn is_minter(minter: AztecAddress) -> pub bool {
        storage.minters.at(minter).read()
    }
    // docs:end:is_minter

    // docs:start:total_supply
    unconstrained fn total_supply() -> pub Field {
        storage.total_supply.read().to_integer()
    }
    // docs:end:total_supply

    // docs:start:balance_of_private
    unconstrained fn balance_of_private(owner: AztecAddress) -> pub Field {
        storage.balances.balance_of(owner).to_integer()
    }
    // docs:end:balance_of_private

    // docs:start:balance_of_public
    unconstrained fn balance_of_public(owner: AztecAddress) -> pub Field {
        storage.public_balances.at(owner).read().to_integer()
    }
    // docs:end:balance_of_public

    #[aztec(private)]
    fn split_it(other: AztecAddress, amount_1: Field, amount_2: Field) {
        let res = context.call_private_function(
            context.this_address(),
            FunctionSelector::from_signature("split_to_partial_notes((Field),(Field),Field,Field)"),
            [
            context.msg_sender().to_field(),
            other.to_field(),
            amount_1 + amount_2,
            0
        ]
        );

        context.call_public_function(
            context.this_address(),
            FunctionSelector::from_signature("complete_partial_notes([Field;2],[Field;2])"),
            [res[0], res[1], amount_1, amount_2]
        );
    }

    #[aztec(private)]
    fn split_to_partial_notes(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) -> [Field; 2] {
        // if (!from.eq(context.msg_sender())) {
        //     assert_current_call_valid_authwit(&mut context, from);
        // } else {
        //     assert(nonce == 0, "invalid nonce");
        // }

        storage.balances.sub(from, U128::from_integer(amount));

        let mut partial_note_1 = TokenNote::new(U128::from_integer(0), from);
        let mut partial_note_2 = TokenNote::new(U128::from_integer(0), to);

        let from_slot = storage.balances.map.at(from).storage_slot;
        let to_slot = storage.balances.map.at(to).storage_slot;

        let partial_note_hash_1 = create_partial_note(&mut context, from_slot, &mut partial_note_1, true);
        let partial_note_hash_2 = create_partial_note(&mut context, to_slot, &mut partial_note_2, true);

        // hack for quick e2e testing. This is public information as it's been hashed and salted
        emit_unencrypted_log_from_private(&mut context, [partial_note_hash_1, partial_note_hash_2]);

        // hack, we shouldn't be emitting any of the private information as
        // it's already included in the partial note created by `create_partial_note`
        // but this is necessary until PXE learns to keep track of partial notes
        emit_unencrypted_log_from_private(
            &mut context,
            [partial_note_1.randomness, partial_note_2.randomness]
        );
        emit_unencrypted_log_from_private(&mut context, [from_slot, to_slot]);

        emit_unencrypted_log_from_private(
            &mut context,
            [
            partial_note_1.compute_inner_note_content_hash(), partial_note_2.compute_inner_note_content_hash()
        ]
        );

        debug_log_format(
            "split amount {0} into\n\t - note {1} at slot {2}\n\t - note {3} at slot {4}",
            [amount, partial_note_hash_1, from_slot, partial_note_hash_2, to_slot]
        );

        context.call_public_function(
            context.this_address(),
            FunctionSelector::from_signature("auth_partial_notes((Field))"),
            [
            compute_partial_notes_pair_hash(
                partial_note_hash_1,
                partial_note_hash_2,
                context.msg_sender(),
                amount
            ).to_field()
        ]
        );

        [partial_note_hash_1, partial_note_hash_2]
    }

    #[aztec(public)]
    internal fn auth_partial_notes(hash: PartialNotesHash) {
        storage.partial_notes.at(hash).write(true);
    }

    #[aztec(public)]
    fn complete_partial_notes(partial_note_hashes: [Field; 2], amounts: [Field; 2]) {
        let hash = compute_partial_notes_pair_hash(
            partial_note_hashes[0],
            partial_note_hashes[1],
            context.msg_sender(),
            amounts[0] + amounts[1]
        );

        assert(storage.partial_notes.at(hash).read(), "partial note not authorized");
        context.push_new_nullifier(hash.to_field(), 0);

        let mut token_note_1 = TokenNote::from_partial(U128::from_integer(amounts[0]), 0);
        complete_partial_note_from_public(&mut context, partial_note_hashes[0], &mut token_note_1);
        // create_note_hash_from_public(&mut context, slots[0], &mut token_note_1);

        let mut token_note_2 = TokenNote::from_partial(U128::from_integer(amounts[1]), 0);
        complete_partial_note_from_public(&mut context, partial_note_hashes[1], &mut token_note_2);
        // create_note_hash_from_public(&mut context, slots[1], &mut token_note_2);

        emit_unencrypted_log(&mut context, amounts);
    }
}
// docs:end:token_all

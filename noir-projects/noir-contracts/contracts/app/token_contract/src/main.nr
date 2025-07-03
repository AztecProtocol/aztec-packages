// docs:start:token_all
// docs:start:imports
mod types;
mod test;

use dep::aztec::macros::aztec;

// Minimal token implementation that supports `AuthWit` accounts.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.
#[aztec]
pub contract Token {
    // Libs
    use std::ops::{Add, Sub};

    use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        context::{PrivateCallInterface, PrivateContext, PublicContext},
        event::event_interface::{emit_event_in_private_log, PrivateLogContent},
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained},
        state_vars::{Map, PublicImmutable, PublicMutable},
    };

    use dep::uint_note::uint_note::{PartialUintNote, UintNote};
    use aztec::protocol_types::{address::AztecAddress, traits::ToField};

    // docs:start:import_authwit
    use aztec::authwit::auth::{
        assert_current_call_valid_authwit, assert_current_call_valid_authwit_public,
        compute_authwit_nullifier,
    };
    // docs:end:import_authwit

    use crate::types::balance_set::BalanceSet;

    // docs:end::imports

    // In the first transfer iteration we are computing a lot of additional information (validating inputs, retrieving
    // keys, etc.), so the gate count is already relatively high. We therefore only read a few notes to keep the happy
    // case with few constraints.
    global INITIAL_TRANSFER_CALL_MAX_NOTES: u32 = 2;
    // All the recursive call does is nullify notes, meaning the gate count is low, but it is all constant overhead. We
    // therefore read more notes than in the base case to increase the efficiency of the overhead, since this results in
    // an overall small circuit regardless.
    global RECURSIVE_TRANSFER_CALL_MAX_NOTES: u32 = 8;

    #[event]
    struct Transfer {
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
    }

    // docs:start:storage_struct
    #[storage]
    struct Storage<Context> {
        // docs:start:storage_admin
        admin: PublicMutable<AztecAddress, Context>,
        // docs:end:storage_admin
        // docs:start:storage_minters
        minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        // docs:end:storage_minters
        // docs:start:storage_balances
        balances: Map<AztecAddress, BalanceSet<Context>, Context>,
        // docs:end:storage_balances
        total_supply: PublicMutable<u128, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        symbol: PublicImmutable<FieldCompressedString, Context>,
        name: PublicImmutable<FieldCompressedString, Context>,
        // docs:start:storage_decimals
        decimals: PublicImmutable<u8, Context>,
        // docs:end:storage_decimals
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, decimals: u8) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.write(admin);
        storage.minters.at(admin).write(true);
        storage.name.initialize(FieldCompressedString::from_string(name));
        storage.symbol.initialize(FieldCompressedString::from_string(symbol));
        // docs:start:initialize_decimals
        storage.decimals.initialize(decimals);
        // docs:end:initialize_decimals
    }
    // docs:end:constructor

    // docs:start:set_admin
    #[public]
    fn set_admin(new_admin: AztecAddress) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        // docs:start:write_admin
        storage.admin.write(new_admin);
        // docs:end:write_admin
    }
    // docs:end:set_admin

    #[public]
    #[view]
    fn public_get_name() -> FieldCompressedString {
        storage.name.read()
    }

    #[private]
    #[view]
    fn private_get_name() -> FieldCompressedString {
        storage.name.read()
    }

    #[public]
    #[view]
    fn public_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read()
    }

    #[private]
    #[view]
    fn private_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read()
    }

    #[public]
    #[view]
    fn public_get_decimals() -> pub u8 {
        storage.decimals.read()
    }

    #[private]
    #[view]
    fn private_get_decimals() -> pub u8 {
        storage.decimals.read()
    }

    // docs:start:admin
    #[public]
    #[view]
    fn get_admin() -> Field {
        storage.admin.read().to_field()
    }
    // docs:end:admin

    // docs:start:is_minter
    #[public]
    #[view]
    fn is_minter(minter: AztecAddress) -> bool {
        storage.minters.at(minter).read()
    }
    // docs:end:is_minter

    // docs:start:total_supply
    #[public]
    #[view]
    fn total_supply() -> u128 {
        storage.total_supply.read()
    }
    // docs:end:total_supply

    // docs:start:balance_of_public
    #[public]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> u128 {
        storage.public_balances.at(owner).read()
    }
    // docs:end:balance_of_public

    // docs:start:set_minter
    #[public]
    fn set_minter(minter: AztecAddress, approve: bool) {
        // docs:start:read_admin
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        // docs:end:read_admin
        // docs:start:write_minter
        storage.minters.at(minter).write(approve);
        // docs:end:write_minter
    }
    // docs:end:set_minter

    // docs:start:mint_to_public
    #[public]
    fn mint_to_public(to: AztecAddress, amount: u128) {
        // docs:start:read_minter
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        // docs:end:read_minter
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);
        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }
    // docs:end:mint_to_public

    // docs:start:transfer_in_public
    #[public]
    fn transfer_in_public(
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);
        let to_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(to_balance);
    }
    // docs:end:transfer_in_public

    // docs:start:burn_public
    #[public]
    fn burn_public(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        // docs:start:assert_current_call_valid_authwit_public
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }
        // docs:end:assert_current_call_valid_authwit_public
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }
    // docs:end:burn_public

    // docs:start:transfer_to_public
    #[private]
    fn transfer_to_public(
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }

        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        Token::at(context.this_address())._increase_public_balance(to, amount).enqueue(&mut context);
    }
    // docs:end:transfer_to_public

    /// Transfers tokens from private balance of `from` to public balance of `to` and prepares a partial note for
    /// receiving change for `from`.
    ///
    /// This is an optimization that combines two operations into one to reduce contract calls:
    /// 1. Transfers `amount` tokens from `from`'s private balance to `to`'s public balance
    /// 2. Creates a partial note that can later be used to receive change back to `from`'s private balance
    ///
    /// This pattern is useful when interacting with contracts that:
    /// - Receive tokens from a user's private balance
    /// - Need to wait until public execution to determine how many tokens to return (e.g. AMM, FPC)
    /// - Will return tokens to the user's private balance
    ///
    /// The contract can use the returned partial note to complete the transfer back to private
    /// once the final amount is known during public execution.
    #[private]
    fn transfer_to_public_and_prepare_private_balance_increase(
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
    ) -> PartialUintNote {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }

        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        Token::at(context.this_address())._increase_public_balance(to, amount).enqueue(&mut context);

        // We prepare the private balance increase (the partial note for the change).
        _prepare_private_balance_increase(from, from, &mut context, storage)
    }

    // docs:start:transfer
    #[private]
    fn transfer(to: AztecAddress, amount: u128) {
        let from = context.msg_sender();

        // We reduce `from`'s balance by amount by recursively removing notes over potentially multiple calls. This
        // method keeps the gate count for each individual call low - reading too many notes at once could result in
        // circuits in which proving is not feasible.
        // Since the sum of the amounts in the notes we nullified was potentially larger than amount, we create a new
        // note for `from` with the change amount, e.g. if `amount` is 10 and two notes are nullified with amounts 8 and
        // 5, then the change will be 3 (since 8 + 5 - 10 = 3).
        let change = subtract_balance(
            &mut context,
            storage,
            from,
            amount,
            INITIAL_TRANSFER_CALL_MAX_NOTES,
        );
        storage.balances.at(from).add(from, change).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            from,
            from,
        ));
        storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            to,
            from,
        ));

        // We don't constrain encryption of the note log in `transfer` (unlike in `transfer_in_private`) because the transfer
        // function is only designed to be used in situations where the event is not strictly necessary (e.g. payment to
        // another person where the payment is considered to be successful when the other party successfully decrypts a
        // note).
        // docs:start:encrypted_unconstrained
        emit_event_in_private_log(
            Transfer { from, to, amount },
            &mut context,
            from,
            to,
            PrivateLogContent.NO_CONSTRAINTS,
        );
        // docs:end:encrypted_unconstrained
    }
    // docs:end:transfer

    #[contract_library_method]
    fn subtract_balance(
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
        account: AztecAddress,
        amount: u128,
        max_notes: u32,
    ) -> u128 {
        let subtracted = storage.balances.at(account).try_sub(amount, max_notes);
        // Failing to subtract any amount means that the owner was unable to produce more notes that could be nullified.
        // We could in some cases fail early inside try_sub if we detected that fewer notes than the maximum were
        // returned and we were still unable to reach the target amount, but that'd make the code more complicated, and
        // optimizing for the failure scenario is not as important.
        assert(subtracted > 0 as u128, "Balance too low");
        if subtracted >= amount {
            // We have achieved our goal of nullifying notes that add up to more than amount, so we return the change
            subtracted - amount
        } else {
            // try_sub failed to nullify enough notes to reach the target amount, so we compute the amount remaining
            // and try again.
            let remaining = amount - subtracted;
            compute_recurse_subtract_balance_call(*context, account, remaining).call(context)
        }
    }

    // TODO(#7729): apply no_predicates to the contract interface method directly instead of having to use a wrapper
    // like we do here.
    #[no_predicates]
    #[contract_library_method]
    fn compute_recurse_subtract_balance_call(
        context: PrivateContext,
        account: AztecAddress,
        remaining: u128,
    ) -> PrivateCallInterface<25, u128, 1> {
        Token::at(context.this_address())._recurse_subtract_balance(account, remaining)
    }

    #[internal]
    #[private]
    fn _recurse_subtract_balance(account: AztecAddress, amount: u128) -> u128 {
        subtract_balance(
            &mut context,
            storage,
            account,
            amount,
            RECURSIVE_TRANSFER_CALL_MAX_NOTES,
        )
    }

    /**
     * Cancel a private authentication witness.
     * @param inner_hash The inner hash of the authwit to cancel.
     */
    // docs:start:cancel_authwit
    #[private]
    fn cancel_authwit(inner_hash: Field) {
        let on_behalf_of = context.msg_sender();
        let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
        context.push_nullifier(nullifier);
    }
    // docs:end:cancel_authwit

    // docs:start:transfer_in_private
    #[private]
    fn transfer_in_private(
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
    ) {
        // docs:start:assert_current_call_valid_authwit
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }
        // docs:end:assert_current_call_valid_authwit

        // docs:start:increase_private_balance
        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        // docs:end:increase_private_balance
        storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note(&mut context, to, from));
    }
    // docs:end:transfer_in_private

    // docs:start:burn_private
    #[private]
    fn burn_private(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }
        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        Token::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
    }
    // docs:end:burn_private

    // docs:start:transfer_to_private
    // Transfers token `amount` from public balance of message sender to a private balance of `to`.
    #[private]
    fn transfer_to_private(to: AztecAddress, amount: u128) {
        // `from` is the owner of the public balance from which we'll subtract the `amount`.
        let from = context.msg_sender();
        let token = Token::at(context.this_address());

        // We prepare the private balance increase (the partial note).
        let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);

        // At last we finalize the transfer. Usage of the `unsafe` method here is safe because we set the `from`
        // function argument to a message sender, guaranteeing that he can transfer only his own tokens.
        token._finalize_transfer_to_private_unsafe(from, amount, partial_note).enqueue(&mut context);
    }
    // docs:end:transfer_to_private

    // docs:start:prepare_private_balance_increase
    /// Prepares an increase of private balance of `to` (partial note). The increase needs to be finalized by calling
    /// some of the finalization functions (`finalize_transfer_to_private`, `finalize_mint_to_private`) with the
    /// returned partial note.
    #[private]
    fn prepare_private_balance_increase(to: AztecAddress, from: AztecAddress) -> PartialUintNote {
        // ideally we'd not have `from` here, but we do need a `from` address to produce a tagging secret with `to`.
        _prepare_private_balance_increase(from, to, &mut context, storage)
    }
    // docs:end:prepare_private_balance_increase

    /// This function exists separately from `prepare_private_balance_increase` solely as an optimization as it allows
    /// us to have it inlined in the `transfer_to_private` function which results in one fewer kernel iteration. Note
    /// that in this case we don't pass `completer` as an argument to this function because in all the callsites we
    /// want to use the message sender as the completer anyway.
    ///
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[contract_library_method]
    fn _prepare_private_balance_increase(
        from: AztecAddress, // sender of the tag
        to: AztecAddress,
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
    ) -> PartialUintNote {
        let partial_note = UintNote::partial(
            to,
            storage.balances.at(to).set.storage_slot,
            context,
            to,
            from,
            context.msg_sender(),
        );

        partial_note
    }

    // docs:start:finalize_transfer_to_private
    /// Finalizes a transfer of token `amount` from public balance of `msg_sender` to a private balance of `to`.
    /// The transfer must be prepared by calling `prepare_private_balance_increase` from `msg_sender` account and
    /// the resulting `partial_note` must be passed as an argument to this function.
    ///
    /// Note that this contract does not protect against a `partial_note` being used multiple times and it is up to
    /// the caller of this function to ensure that it doesn't happen. If the same `partial_note` is used multiple
    /// times, the token `amount` would most likely get lost (the partial note log processing functionality would fail
    /// to find the pending partial note when trying to complete it).
    #[public]
    fn finalize_transfer_to_private(amount: u128, partial_note: PartialUintNote) {
        // Completer is the entity that can complete the partial note. In this case, it's the same as the account
        // `from` from whose balance we're subtracting the `amount`.
        let from_and_completer = context.msg_sender();
        _finalize_transfer_to_private(
            from_and_completer,
            amount,
            partial_note,
            &mut context,
            storage,
        );
    }
    // docs:end:finalize_transfer_to_private

    /// Finalizes a transfer of token `amount` from private balance of `from` to a private balance of `to`.
    /// The transfer must be prepared by calling `prepare_private_balance_increase` from `from` account and
    /// the resulting `partial_note` must be passed as an argument to this function.
    ///
    /// Note that this contract does not protect against a `partial_note` being used multiple times and it is up to
    /// the caller of this function to ensure that it doesn't happen. If the same `partial_note` is used multiple
    /// times, the token `amount` would most likely get lost (the partial note log processing functionality would fail
    /// to find the pending partial note when trying to complete it).
    #[private]
    fn finalize_transfer_to_private_from_private(
        from: AztecAddress,
        partial_note: PartialUintNote,
        amount: u128,
        authwit_nonce: Field,
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }

        // First we subtract the `amount` from the private balance of `from`
        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));

        partial_note.complete_from_private(&mut context, context.msg_sender(), amount);
    }

    // docs:start:finalize_transfer_to_private_unsafe
    /// This is a wrapper around `_finalize_transfer_to_private` placed here so that a call
    /// to `_finalize_transfer_to_private` can be enqueued. Called unsafe as it does not check `from_and_completer`
    /// (this has to be done in the calling function).
    #[public]
    #[internal]
    fn _finalize_transfer_to_private_unsafe(
        from_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
    ) {
        _finalize_transfer_to_private(
            from_and_completer,
            amount,
            partial_note,
            &mut context,
            storage,
        );
    }
    // docs:end:finalize_transfer_to_private_unsafe

    // In all the flows in this contract, `from` (the account from which we're subtracting the `amount`) and
    // `completer` (the entity that can complete the partial note) are the same so we represent them with a single
    // argument.
    #[contract_library_method]
    fn _finalize_transfer_to_private(
        from_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        // First we subtract the `amount` from the public balance of `from_and_completer`
        let from_balance = storage.public_balances.at(from_and_completer).read().sub(amount);
        storage.public_balances.at(from_and_completer).write(from_balance);

        // We finalize the transfer by completing the partial note.
        partial_note.complete(context, from_and_completer, amount);
    }

    // docs:start:mint_to_private
    /// Mints token `amount` to a private balance of `to`. Message sender has to have minter permissions (checked
    /// in the enqueued call).
    #[private]
    fn mint_to_private(
        // TODO(benesjan): This allows minter to set arbitrary `from`. That seems undesirable. Will nuke it in a followup PR.
        from: AztecAddress, // sender of the tag
        to: AztecAddress,
        amount: u128,
    ) {
        let token = Token::at(context.this_address());

        // We prepare the partial note to which we'll "send" the minted amount.
        let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);

        // At last we finalize the mint. Usage of the `unsafe` method here is safe because we set
        // the `minter_and_completer` function argument to a message sender, guaranteeing that only a message sender
        // with minter permissions can successfully execute the function.
        token._finalize_mint_to_private_unsafe(context.msg_sender(), amount, partial_note).enqueue(
            &mut context,
        );
    }
    // docs:end:mint_to_private

    // docs:start:finalize_mint_to_private
    /// Finalizes a mint of token `amount` to a private balance of `to`. The mint must be prepared by calling
    /// `prepare_private_balance_increase` first and the resulting
    /// `partial_note` must be passed as an argument to this function.
    ///
    /// Note: This function is only an optimization as it could be replaced by a combination of `mint_to_public`
    /// and `finalize_transfer_to_private`. It is however used very commonly so it makes sense to optimize it
    /// (e.g. used during token bridging, in AMM liquidity token etc.).
    #[public]
    fn finalize_mint_to_private(amount: u128, partial_note: PartialUintNote) {
        // Completer is the entity that can complete the partial note. In this case, it's the same as the minter
        // account.
        let minter_and_completer = context.msg_sender();
        assert(storage.minters.at(minter_and_completer).read(), "caller is not minter");

        _finalize_mint_to_private(
            minter_and_completer,
            amount,
            partial_note,
            &mut context,
            storage,
        );
    }
    // docs:end:finalize_mint_to_private

    // docs:start:finalize_mint_to_private_unsafe
    /// This is a wrapper around `_finalize_mint_to_private` placed here so that a call
    /// to `_finalize_mint_to_private` can be enqueued. Called unsafe as it does not check `minter_and_completer` (this
    /// has to be done in the calling function).
    #[public]
    #[internal]
    fn _finalize_mint_to_private_unsafe(
        minter_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
    ) {
        // We check the minter permissions as it was not done in `mint_to_private` function.
        assert(storage.minters.at(minter_and_completer).read(), "caller is not minter");
        _finalize_mint_to_private(
            minter_and_completer,
            amount,
            partial_note,
            &mut context,
            storage,
        );
    }
    // docs:end:finalize_mint_to_private_unsafe

    #[contract_library_method]
    fn _finalize_mint_to_private(
        completer: AztecAddress, // entity that can complete the partial note
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        // First we increase the total supply by the `amount`
        let supply = storage.total_supply.read().add(amount);
        storage.total_supply.write(supply);

        // We finalize the transfer by completing the partial note.
        partial_note.complete(context, completer, amount);
    }

    /// Internal ///
    // docs:start:increase_public_balance
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[public]
    #[internal]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {
        _increase_public_balance_inner(to, amount, storage);
    }
    // docs:end:increase_public_balance

    #[contract_library_method]
    fn _increase_public_balance_inner(
        to: AztecAddress,
        amount: u128,
        storage: Storage<&mut PublicContext>,
    ) {
        let new_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(new_balance);
    }

    // docs:start:reduce_total_supply
    #[public]
    #[internal]
    fn _reduce_total_supply(amount: u128) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }
    // docs:end:reduce_total_supply

    // docs:start:balance_of_private
    #[utility]
    pub(crate) unconstrained fn balance_of_private(owner: AztecAddress) -> u128 {
        storage.balances.at(owner).balance_of()
    }
    // docs:end:balance_of_private
}

// docs:end:token_all

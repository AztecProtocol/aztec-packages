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
contract Token {
    // Libs
    use std::meta::derive;

    use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        context::{PrivateCallInterface, PrivateContext},
        encrypted_logs::{
            encrypted_event_emission::encode_and_encrypt_event_unconstrained,
            encrypted_note_emission::encode_and_encrypt_note_unconstrained,
        },
        macros::{
            events::event,
            functions::{initializer, internal, private, public, view},
            storage::storage,
        },
        oracle::random::random,
        prelude::{
            AztecAddress, FunctionSelector, Map, PublicContext, PublicImmutable, PublicMutable,
        },
        protocol_types::{point::Point, traits::Serialize},
    };

    use dep::uint_note::uint_note::UintNote;

    // docs:start:import_authwit
    use dep::authwit::auth::{
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

    #[derive(Serialize)]
    #[event]
    struct Transfer {
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
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
        total_supply: PublicMutable<U128, Context>,
        public_balances: Map<AztecAddress, PublicMutable<U128, Context>, Context>,
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
    fn total_supply() -> Field {
        storage.total_supply.read().to_integer()
    }
    // docs:end:total_supply

    // docs:start:balance_of_public
    #[public]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> Field {
        storage.public_balances.at(owner).read().to_integer()
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
    fn mint_to_public(to: AztecAddress, amount: Field) {
        // docs:start:read_minter
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        // docs:end:read_minter
        let amount = U128::from_integer(amount);
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);
        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }
    // docs:end:mint_to_public

    // docs:start:transfer_in_public
    #[public]
    fn transfer_in_public(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
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
    // docs:end:transfer_in_public

    // docs:start:burn_public
    #[public]
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

    // docs:start:transfer_to_public
    #[private]
    fn transfer_to_public(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        // TODO: constrain encryption below - we are using unconstrained here only because of the following Noir issue
        // https://github.com/noir-lang/noir/issues/5771
        storage.balances.at(from).sub(from, U128::from_integer(amount)).emit(
            encode_and_encrypt_note_unconstrained(&mut context, from, from),
        );
        Token::at(context.this_address())._increase_public_balance(to, amount).enqueue(&mut context);
    }
    // docs:end:transfer_to_public

    // docs:start:transfer
    #[private]
    fn transfer(to: AztecAddress, amount: Field) {
        let from = context.msg_sender();

        let amount = U128::from_integer(amount);
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
        Transfer { from, to, amount: amount.to_field() }.emit(
            encode_and_encrypt_event_unconstrained(&mut context, to, from),
        );
    }
    // docs:end:transfer

    #[contract_library_method]
    fn subtract_balance(
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
        account: AztecAddress,
        amount: U128,
        max_notes: u32,
    ) -> U128 {
        let subtracted = storage.balances.at(account).try_sub(amount, max_notes);
        // Failing to subtract any amount means that the owner was unable to produce more notes that could be nullified.
        // We could in some cases fail early inside try_sub if we detected that fewer notes than the maximum were
        // returned and we were still unable to reach the target amount, but that'd make the code more complicated, and
        // optimizing for the failure scenario is not as important.
        assert(subtracted > U128::from_integer(0), "Balance too low");
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
        remaining: U128,
    ) -> PrivateCallInterface<25, U128> {
        Token::at(context.this_address())._recurse_subtract_balance(account, remaining.to_field())
    }

    // TODO(#7728): even though the amount should be a U128, we can't have that type in a contract interface due to
    // serialization issues.
    #[internal]
    #[private]
    fn _recurse_subtract_balance(account: AztecAddress, amount: Field) -> U128 {
        subtract_balance(
            &mut context,
            storage,
            account,
            U128::from_integer(amount),
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
    fn transfer_in_private(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        // docs:start:assert_current_call_valid_authwit
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        // docs:end:assert_current_call_valid_authwit

        let amount = U128::from_integer(amount);
        // docs:start:increase_private_balance
        // docs:start:encrypted
        // TODO: constrain encryption below - we are using unconstrained here only becuase of the following Noir issue
        // https://github.com/noir-lang/noir/issues/5771
        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            from,
            from,
        ));
        // docs:end:encrypted
        // docs:end:increase_private_balance
        // TODO: constrain encryption below - we are using unconstrained here only becuase of the following Noir issue
        // https://github.com/noir-lang/noir/issues/5771
        storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            to,
            from,
        ));
    }
    // docs:end:transfer_in_private

    // docs:start:burn_private
    #[private]
    fn burn_private(from: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        // TODO: constrain encryption below - we are using unconstrained here only becuase of the following Noir issue
        // https://github.com/noir-lang/noir/issues/5771
        storage.balances.at(from).sub(from, U128::from_integer(amount)).emit(
            encode_and_encrypt_note_unconstrained(&mut context, from, from),
        );
        Token::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
    }
    // docs:end:burn_private

    // docs:start:transfer_to_private
    // Transfers token `amount` from public balance of message sender to a private balance of `to`.
    #[private]
    fn transfer_to_private(to: AztecAddress, amount: Field) {
        // `from` is the owner of the public balance from which we'll subtract the `amount`.
        let from = context.msg_sender();
        let token = Token::at(context.this_address());

        // We prepare the private balance increase (the partial note).
        let hiding_point_slot = _prepare_private_balance_increase(from, to, &mut context, storage);

        // At last we finalize the transfer. Usage of the `unsafe` method here is safe because we set the `from`
        // function argument to a message sender, guaranteeing that he can transfer only his own tokens.
        token._finalize_transfer_to_private_unsafe(from, amount, hiding_point_slot).enqueue(
            &mut context,
        );
    }
    // docs:end:transfer_to_private

    // docs:start:prepare_private_balance_increase
    /// Prepares an increase of private balance of `to` (partial note). The increase needs to be finalized by calling
    /// some of the finalization functions (`finalize_transfer_to_private`, `finalize_mint_to_private`).
    /// Returns a hiding point slot.
    #[private]
    fn prepare_private_balance_increase(to: AztecAddress, from: AztecAddress) -> Field {
        // TODO(#9887): ideally we'd not have `from` here, but we do need a `from` address to produce a tagging secret
        // with `to`.
        _prepare_private_balance_increase(from, to, &mut context, storage)
    }
    // docs:end:prepare_private_balance_increase

    /// This function exists separately from `prepare_private_balance_increase` solely as an optimization as it allows
    /// us to have it inlined in the `transfer_to_private` function which results in one less kernel iteration.
    ///
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[contract_library_method]
    fn _prepare_private_balance_increase(
        from: AztecAddress, // sender of the tag: TODO(#9887): this is not great?
        to: AztecAddress,
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
    ) -> Field {
        let to_note_slot = storage.balances.at(to).set.storage_slot;

        // We create a setup payload with unpopulated/zero `amount` for 'to'
        // TODO(#7775): Manually fetching the randomness here is not great. If we decide to include randomness in all
        // notes we could just inject it in macros.
        let note_randomness = unsafe { random() };
        let note_setup_payload = UintNote::setup_payload().new(to, note_randomness, to_note_slot);

        // We get the keys and encrypt the log of the note
        let setup_log = note_setup_payload.encrypt_log(context, to, from);

        // Using the x-coordinate as a hiding point slot is safe against someone else interfering with it because
        // we have a guarantee that the public functions of the transaction are executed right after the private ones
        // and for this reason the protocol guarantees that nobody can front-run us in consuming the hiding point.
        // This guarantee would break if `finalize_transfer_to_private` was not called in the same transaction. This
        // however is not the flow we are currently concerned with. To support the multi-transaction flow we could
        // introduce a `from` function argument, hash the x-coordinate with it and then repeat the hashing in
        // `finalize_transfer_to_private`.
        //
        // We can also be sure that the `hiding_point_slot` will not overwrite any other value in the storage because
        // in our state variables we derive slots using a different hash function from multi scalar multiplication
        // (MSM).
        let hiding_point_slot = note_setup_payload.hiding_point.x;

        // We don't need to perform a check that the value overwritten by `_store_point_in_transient_storage_unsafe`
        // is zero because the slot is the x-coordinate of the hiding point and hence we could only overwrite
        // the value in the slot with the same value. This makes usage of the `unsafe` method safe.
        Token::at(context.this_address())
            ._store_payload_in_transient_storage_unsafe(
                hiding_point_slot,
                note_setup_payload.hiding_point,
                setup_log,
            )
            .enqueue(context);

        hiding_point_slot
    }

    // docs:start:finalize_transfer_to_private
    /// Finalizes a transfer of token `amount` from public balance of `from` to a private balance of `to`.
    /// The transfer must be prepared by calling `prepare_private_balance_increase` first and the resulting
    /// `hiding_point_slot` must be passed as an argument to this function.
    #[public]
    fn finalize_transfer_to_private(amount: Field, hiding_point_slot: Field) {
        let from = context.msg_sender();
        _finalize_transfer_to_private(from, amount, hiding_point_slot, &mut context, storage);
    }
    // docs:end:finalize_transfer_to_private

    // docs:start:finalize_transfer_to_private_unsafe
    /// This is a wrapper around `_finalize_transfer_to_private` placed here so that a call
    /// to `_finalize_transfer_to_private` can be enqueued. Called unsafe as it does not check `from` (this has to be
    /// done in the calling function).
    #[public]
    #[internal]
    fn _finalize_transfer_to_private_unsafe(
        from: AztecAddress,
        amount: Field,
        hiding_point_slot: Field,
    ) {
        _finalize_transfer_to_private(from, amount, hiding_point_slot, &mut context, storage);
    }
    // docs:end:finalize_transfer_to_private_unsafe

    #[contract_library_method]
    fn _finalize_transfer_to_private(
        from: AztecAddress,
        amount: Field,
        hiding_point_slot: Field,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        // TODO(#8271): Type the amount as U128 and nuke the ugly cast
        let amount = U128::from_integer(amount);

        // First we subtract the `amount` from the public balance of `from`
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        // Then we finalize the partial note with the `amount`
        let finalization_payload =
            UintNote::finalization_payload().new(context, hiding_point_slot, amount);

        // At last we emit the note hash and the final log
        finalization_payload.emit();
    }

    // docs:start:mint_to_private
    /// Mints token `amount` to a private balance of `to`. Message sender has to have minter permissions (checked
    /// in the enqueued call).
    #[private]
    fn mint_to_private(
        from: AztecAddress, // sender of the tag: TODO(#9887): this is not great?
        to: AztecAddress,
        amount: Field,
    ) {
        let token = Token::at(context.this_address());

        // We prepare the partial note to which we'll "send" the minted amount.
        let hiding_point_slot = _prepare_private_balance_increase(from, to, &mut context, storage);

        // At last we finalize the mint. Usage of the `unsafe` method here is safe because we set the `from`
        // function argument to a message sender, guaranteeing that only a message sender with minter permissions
        // can successfully execute the function.
        token
            ._finalize_mint_to_private_unsafe(context.msg_sender(), amount, hiding_point_slot)
            .enqueue(&mut context);
    }
    // docs:end:mint_to_private

    // docs:start:finalize_mint_to_private
    /// Finalizes a mint of token `amount` to a private balance of `to`. The mint must be prepared by calling
    /// `prepare_private_balance_increase` first and the resulting
    /// `hiding_point_slot` must be passed as an argument to this function.
    ///
    /// Note: This function is only an optimization as it could be replaced by a combination of `mint_to_public`
    /// and `finalize_transfer_to_private`. It is however used very commonly so it makes sense to optimize it
    /// (e.g. used during token bridging, in AMM liquidity token etc.).
    #[public]
    fn finalize_mint_to_private(amount: Field, hiding_point_slot: Field) {
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");

        _finalize_mint_to_private(amount, hiding_point_slot, &mut context, storage);
    }
    // docs:end:finalize_mint_to_private

    // docs:start:finalize_mint_to_private_unsafe
    #[public]
    #[internal]
    fn _finalize_mint_to_private_unsafe(
        from: AztecAddress,
        amount: Field,
        hiding_point_slot: Field,
    ) {
        // We check the minter permissions as it was not done in `mint_to_private` function.
        assert(storage.minters.at(from).read(), "caller is not minter");
        _finalize_mint_to_private(amount, hiding_point_slot, &mut context, storage);
    }
    // docs:end:finalize_mint_to_private_unsafe

    #[contract_library_method]
    fn _finalize_mint_to_private(
        amount: Field,
        hiding_point_slot: Field,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        let amount = U128::from_integer(amount);

        // First we increase the total supply by the `amount`
        let supply = storage.total_supply.read().add(amount);
        storage.total_supply.write(supply);

        // Then we finalize the partial note with the `amount`
        let finalization_payload =
            UintNote::finalization_payload().new(context, hiding_point_slot, amount);

        // At last we emit the note hash and the final log
        finalization_payload.emit();
    }

    // docs:start:setup_refund
    /// Called by fee payer contract (FPC) to set up a refund for a user during the private fee payment flow.
    #[private]
    fn setup_refund(
        user: AztecAddress, // A user for which we are setting up the fee refund.
        max_fee: Field, // The maximum fee a user is willing to pay for the tx.
        nonce: Field, // A nonce to make authwitness unique.
    ) {
        // 1. This function is called by FPC when setting up a refund so we need to support the authwit flow here
        // and check that the user really permitted fee_recipient to set up a refund on their behalf.
        assert_current_call_valid_authwit(&mut context, user);

        // 2. Deduct the max fee from user's balance. The difference between max fee and the actual tx fee will
        // be refunded to the user in the `complete_refund(...)` function.
        let change = subtract_balance(
            &mut context,
            storage,
            user,
            U128::from_integer(max_fee),
            INITIAL_TRANSFER_CALL_MAX_NOTES,
        );
        // Note: We don't emit the change note straight away and instead we pass the change amount to the teardown
        // function where it gets added to the refund amount. This avoids unnecessary emission of one note.

        // 3. Prepare the partial note for the refund.
        let user_point_slot = _prepare_private_balance_increase(user, user, &mut context, storage);

        // 4. Set the public teardown function to `complete_refund(...)`. Public teardown is the only time when a public
        // function has access to the final transaction fee, which is needed to compute the actual refund amount.
        let fee_recipient = context.msg_sender(); // FPC is the fee recipient.
        context.set_public_teardown_function(
            context.this_address(),
            comptime {
                FunctionSelector::from_signature("complete_refund((Field),Field,Field,Field)")
            },
            [fee_recipient.to_field(), user_point_slot, max_fee, change.to_field()],
        );
    }
    // docs:end:setup_refund

    // TODO(#9375): Having to define the note log length here is very unfortunate as it's basically impossible for
    // users to derive manually. This will however go away once we have a real transient storage since we will not need
    // the public call and instead we would do something like `context.transient_storage_write(slot, payload)` and that
    // will allow us to use generics and hence user will not need to define it explicitly. We cannot use generics here
    // as it is an entrypoint function.
    #[public]
    #[internal]
    fn _store_payload_in_transient_storage_unsafe(
        slot: Field,
        point: Point,
        setup_log: [Field; 9],
    ) {
        context.storage_write(slot, point);
        context.storage_write(slot + aztec::protocol_types::point::POINT_LENGTH as Field, setup_log);
    }

    // TODO(#7728): even though the max_fee should be a U128, we can't have that type in a contract interface due
    // to serialization issues.
    // docs:start:complete_refund
    /// Executed as a public teardown function and is responsible for completing the refund in a private fee payment
    /// flow.
    #[public]
    #[internal]
    fn complete_refund(
        fee_recipient: AztecAddress,
        user_slot: Field,
        max_fee: Field,
        change_owed: Field,
    ) {
        // TODO(#7728): Remove the next line
        let max_fee = U128::from_integer(max_fee);
        let tx_fee = U128::from_integer(context.transaction_fee());
        let change_owed = U128::from_integer(change_owed);

        // 1. We check that user funded the fee payer contract with at least the transaction fee.
        // TODO(#7796): we should try to prevent reverts here
        assert(max_fee >= tx_fee, "max fee not enough to cover tx fee");

        // 2. We compute the refund amount as the difference between funded amount and the tx fee.
        // TODO(#10805): Introduce a real exchange rate
        let refund_amount = max_fee - tx_fee + change_owed;

        // 3. We send the tx fee to the fee recipient in public.
        _increase_public_balance_inner(fee_recipient, tx_fee.to_field(), storage);

        // 4. We construct the user note finalization payload with the refund amount.
        let user_finalization_payload =
            UintNote::finalization_payload().new(&mut context, user_slot, refund_amount);

        // 5. At last we emit the user finalization note hash and the corresponding note log.
        user_finalization_payload.emit();
        // --> Once the tx is settled user and fee recipient can add the notes to their pixies.
    }
    // docs:end:complete_refund

    /// Internal ///
    // docs:start:increase_public_balance
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[public]
    #[internal]
    fn _increase_public_balance(to: AztecAddress, amount: Field) {
        _increase_public_balance_inner(to, amount, storage);
    }
    // docs:end:increase_public_balance

    #[contract_library_method]
    fn _increase_public_balance_inner(
        to: AztecAddress,
        amount: Field,
        storage: Storage<&mut PublicContext>,
    ) {
        let new_balance = storage.public_balances.at(to).read().add(U128::from_integer(amount));
        storage.public_balances.at(to).write(new_balance);
    }

    // docs:start:reduce_total_supply
    #[public]
    #[internal]
    fn _reduce_total_supply(amount: Field) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(U128::from_integer(amount));
        storage.total_supply.write(new_supply);
    }
    // docs:end:reduce_total_supply

    /// Unconstrained ///
    // docs:start:balance_of_private
    pub(crate) unconstrained fn balance_of_private(owner: AztecAddress) -> pub Field {
        storage.balances.at(owner).balance_of().to_field()
    }
    // docs:end:balance_of_private
}

// docs:end:token_all

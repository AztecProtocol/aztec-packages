# Contract Deployment

To add contracts to your application, we'll start by creating a new `aztec-nargo` project. We'll then compile the contracts, and write a simple script to deploy them to our Sandbox.

:::info
Follow the instructions [here](../../../../getting_started.md) to install `aztec-nargo` if you haven't done so already.
:::

## Initialize Aztec project

Create a new `contracts` folder, and from there, initialize a new project called `token`:

```sh
mkdir contracts && cd contracts
aztec-nargo new --contract token
```

Then, open the `contracts/token/Nargo.toml` configuration file, and add the `aztec.nr` and `value_note` libraries as dependencies:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/aztec" }
authwit = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/authwit"}
uint_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/uint-note" }
compressed_string = {git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/compressed-string"}
```

Last, copy-paste the code from the `Token` contract into `contracts/token/main.nr`:

```rust title="token_all" showLineNumbers 
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
        context::{PrivateCallInterface, PrivateContext},
        event::event_interface::{emit_event_in_private_log, PrivateLogContent},
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained},
        prelude::{AztecAddress, Map, PublicContext, PublicImmutable, PublicMutable},
    };

    use dep::uint_note::uint_note::{PartialUintNote, UintNote};
    use aztec::protocol_types::traits::ToField;

    use dep::authwit::auth::{
        assert_current_call_valid_authwit, assert_current_call_valid_authwit_public,
        compute_authwit_nullifier,
    };

    use crate::types::balance_set::BalanceSet;


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

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        balances: Map<AztecAddress, BalanceSet<Context>, Context>,
        total_supply: PublicMutable<u128, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        symbol: PublicImmutable<FieldCompressedString, Context>,
        name: PublicImmutable<FieldCompressedString, Context>,
        decimals: PublicImmutable<u8, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, decimals: u8) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.write(admin);
        storage.minters.at(admin).write(true);
        storage.name.initialize(FieldCompressedString::from_string(name));
        storage.symbol.initialize(FieldCompressedString::from_string(symbol));
        storage.decimals.initialize(decimals);
    }

    #[public]
    fn set_admin(new_admin: AztecAddress) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        storage.admin.write(new_admin);
    }

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

    #[public]
    #[view]
    fn get_admin() -> Field {
        storage.admin.read().to_field()
    }

    #[public]
    #[view]
    fn is_minter(minter: AztecAddress) -> bool {
        storage.minters.at(minter).read()
    }

    #[public]
    #[view]
    fn total_supply() -> u128 {
        storage.total_supply.read()
    }

    #[public]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> u128 {
        storage.public_balances.at(owner).read()
    }

    #[public]
    fn set_minter(minter: AztecAddress, approve: bool) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        storage.minters.at(minter).write(approve);
    }

    #[public]
    fn mint_to_public(to: AztecAddress, amount: u128) {
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);
        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }

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

    #[public]
    fn burn_public(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(authwit_nonce == 0, "invalid authwit nonce");
        }
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

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
        emit_event_in_private_log(
            Transfer { from, to, amount },
            &mut context,
            from,
            to,
            PrivateLogContent.NO_CONSTRAINTS,
        );
    }

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
    #[private]
    fn cancel_authwit(inner_hash: Field) {
        let on_behalf_of = context.msg_sender();
        let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
        context.push_nullifier(nullifier);
    }

    #[private]
    fn transfer_in_private(
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
        storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note(&mut context, to, from));
    }

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

    /// Prepares an increase of private balance of `to` (partial note). The increase needs to be finalized by calling
    /// some of the finalization functions (`finalize_transfer_to_private`, `finalize_mint_to_private`) with the
    /// returned partial note.
    #[private]
    fn prepare_private_balance_increase(to: AztecAddress, from: AztecAddress) -> PartialUintNote {
        // ideally we'd not have `from` here, but we do need a `from` address to produce a tagging secret with `to`.
        _prepare_private_balance_increase(from, to, &mut context, storage)
    }

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
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[public]
    #[internal]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {
        _increase_public_balance_inner(to, amount, storage);
    }

    #[contract_library_method]
    fn _increase_public_balance_inner(
        to: AztecAddress,
        amount: u128,
        storage: Storage<&mut PublicContext>,
    ) {
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
    pub(crate) unconstrained fn balance_of_private(owner: AztecAddress) -> u128 {
        storage.balances.at(owner).balance_of()
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L1-L728" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L1-L728</a></sub></sup>


### Helper files

:::info
Remove the `mod test;` line from `contracts/token/src/main.nr` as we will not be using TXE tests in this tutorial.
:::

The `Token` contract also requires some helper files. You can view the files [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/token_contract/src). Copy the `types.nr` and the `types` folder into `contracts/token/src`.

Add this `balance_set.nr` file at `token/src/types/balance_set.nr`.

```rust title="balance_set" showLineNumbers 
use dep::aztec::{
    context::{PrivateContext, UtilityContext},
    note::{
        note_emission::OuterNoteEmission, note_getter_options::SortOrder,
        note_interface::NoteProperties, retrieved_note::RetrievedNote,
    },
    protocol_types::{address::AztecAddress, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL},
    state_vars::storage::Storage,
};
use dep::aztec::prelude::{NoteGetterOptions, NoteViewerOptions, PrivateSet};
use dep::uint_note::uint_note::UintNote;
use std::ops::Add;

pub struct BalanceSet<Context> {
    pub set: PrivateSet<UintNote, Context>,
}

// TODO(#13824): remove this impl once we allow structs to hold state variables.
impl<Context> Storage<1> for BalanceSet<Context> {
    fn get_storage_slot(self) -> Field {
        self.set.get_storage_slot()
    }
}

impl<Context> BalanceSet<Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { set: PrivateSet::new(context, storage_slot) }
    }
}

impl BalanceSet<UtilityContext> {
    pub unconstrained fn balance_of(self: Self) -> u128 {
        self.balance_of_with_offset(0)
    }

    pub unconstrained fn balance_of_with_offset(self: Self, offset: u32) -> u128 {
        let mut balance = 0 as u128;
        let mut options = NoteViewerOptions::new();
        let notes = self.set.view_notes(options.set_offset(offset));
        for i in 0..options.limit {
            if i < notes.len() {
                balance = balance + notes.get_unchecked(i).get_value();
            }
        }
        if (notes.len() == options.limit) {
            balance = balance + self.balance_of_with_offset(offset + options.limit);
        }

        balance
    }
}

impl BalanceSet<&mut PrivateContext> {
    pub fn add(self: Self, owner: AztecAddress, addend: u128) -> OuterNoteEmission<UintNote> {
        if addend == 0 as u128 {
            OuterNoteEmission::new(Option::none())
        } else {
            // We fetch the nullifier public key hash from the registry / from our PXE
            let mut addend_note = UintNote::new(addend, owner);

            OuterNoteEmission::new(Option::some(self.set.insert(addend_note)))
        }
    }

    pub fn sub(self: Self, owner: AztecAddress, amount: u128) -> OuterNoteEmission<UintNote> {
        let subtracted = self.try_sub(amount, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL);

        // try_sub may have substracted more or less than amount. We must ensure that we subtracted at least as much as
        // we needed, and then create a new note for the owner for the change (if any).
        assert(subtracted >= amount, "Balance too low");
        self.add(owner, subtracted - amount)
    }

    // Attempts to remove 'target_amount' from the owner's balance. try_sub returns how much was actually subtracted
    // (i.e. the sum of the value of nullified notes), but this subtracted amount may be more or less than the target
    // amount.
    // This may seem odd, but is unfortunately unavoidable due to the number of notes available and their amounts being
    // unknown. What try_sub does is a best-effort attempt to consume as few notes as possible that add up to more than
    // `target_amount`.
    // The `max_notes` parameter is used to fine-tune the number of constraints created by this function. The gate count
    // scales relatively linearly with `max_notes`, but a lower `max_notes` parameter increases the likelihood of
    // `try_sub` subtracting an amount smaller than `target_amount`.
    pub fn try_sub(self: Self, target_amount: u128, max_notes: u32) -> u128 {
        // We are using a preprocessor here (filter applied in an unconstrained context) instead of a filter because
        // we do not need to prove correct execution of the preprocessor.
        // Because the `min_sum` notes is not constrained, users could choose to e.g. not call it. However, all this
        // might result in is simply higher DA costs due to more nullifiers being emitted. Since we don't care
        // about proving optimal note usage, we can save these constraints and make the circuit smaller.
        let options = NoteGetterOptions::with_preprocessor(preprocess_notes_min_sum, target_amount)
            .sort(UintNote::properties().value, SortOrder.DESC)
            .set_limit(max_notes);
        let notes = self.set.pop_notes(options);

        let mut subtracted = 0 as u128;
        for i in 0..options.limit {
            if i < notes.len() {
                let note = notes.get_unchecked(i);
                subtracted = subtracted + note.get_value();
            }
        }

        subtracted
    }
}

// Computes the partial sum of the notes array, stopping once 'min_sum' is reached. This can be used to minimize the
// number of notes read that add to some value, e.g. when transferring some amount of tokens.
// The preprocessor (a filter applied in an unconstrained context) does not check if total sum is larger or equal to
// 'min_sum' - all it does is remove extra notes if it does reach that value.
// Note that proper usage of this preprocessor requires for notes to be sorted in descending order.
pub fn preprocess_notes_min_sum(
    notes: [Option<RetrievedNote<UintNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: u128,
) -> [Option<RetrievedNote<UintNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut sum = 0 as u128;
    for i in 0..notes.len() {
        // Because we process notes in retrieved order, notes need to be sorted in descending amount order for this
        // filter to be useful. Consider a 'min_sum' of 4, and a set of notes with amounts [3, 2, 1, 1, 1, 1, 1]. If
        // sorted in descending order, the filter will only choose the notes with values 3 and 2, but if sorted in
        // ascending order it will choose 4 notes of value 1.
        if notes[i].is_some() & sum < min_sum {
            let retrieved_note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(retrieved_note);
            sum = sum.add(retrieved_note.note.get_value());
        }
    }
    selected
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/token_contract/src/types/balance_set.nr#L1-L136" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/types/balance_set.nr#L1-L136</a></sub></sup>


## Compile your contract

We'll now use `aztec-nargo` to compile.

Now run the following from your contract folder (containing Nargo.toml):

```sh
aztec-nargo compile
```

## Deploy your contracts

Let's now write a script for deploying your contracts to the Sandbox. We'll create a Private eXecution Environment (PXE) client, and then use the `ContractDeployer` class to deploy our contracts, and store the deployment address to a local JSON file.

Create a new file `src/deploy.mjs`. We import the contract artifacts we have generated plus the dependencies we'll need, and then we can deploy the contracts by adding the following code to the `src/deploy.mjs` file.

```js
// src/deploy.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TokenContractJson from "../contracts/token/target/token-Token.json" with { type: "json" };
import { writeFileSync } from 'fs';

const TokenContractArtifact = loadContractArtifact(TokenContractJson);

const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [ownerWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();

  const token = await Contract.deploy(ownerWallet, TokenContractArtifact, [ownerAddress, 'TokenName', 'TKN', 18])
    .send()
    .deployed();

  console.log(`Token deployed at ${token.address.toString()}`);

  const addresses = { token: token.address.toString() };
  writeFileSync('addresses.json', JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(`Error in deployment script: ${err}`);
  process.exit(1);
});
```

Here, we are using the `Contract` class with the compiled artifact to send a new deployment transaction. The `deployed` method will block execution until the transaction is successfully mined, and return a receipt with the deployed contract address.

Note that the token's `constructor()` method expects an `owner` address to set as the contract `admin`. We are using the first account from the Sandbox for this.

:::info
If you are using the generated typescript classes, you can drop the generic `ContractDeployer` in favor of using the `deploy` method of the generated class, which will automatically load the artifact for you and type-check the constructor arguments. See the [How to deploy a contract](../../../../guides/js_apps/deploy_contract.md) page for more info.
:::

Run the snippet above as `node src/deploy.mjs`, and you should see the following output, along with a new `addresses.json` file in your project root:

```text
Token deployed to 0x2950b0f290422ff86b8ee8b91af4417e1464ddfd9dda26de8af52dac9ea4f869
```

## Next steps

Now that we have our contracts set up, it's time to actually [start writing our application that will be interacting with them](./3_contract_interaction.md).

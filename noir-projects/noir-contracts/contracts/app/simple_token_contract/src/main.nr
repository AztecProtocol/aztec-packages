mod types;

use dep::aztec::macros::aztec;

// Minimal token contract. Do not use
// For demonstration purposes in playground only
// If you change the names of these functions, please also update them in playground/src/components/contract/contract.ts

#[aztec]
pub contract SimpleToken {
    use std::{meta::ctstring::AsCtString, ops::{Add, Sub}};

    use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        authwit::auth::compute_authwit_nullifier,
        context::{PrivateCallInterface, PrivateContext, PublicContext},
        event::event_interface::{emit_event_in_private_log, PrivateLogContent},
        macros::{
            events::event,
            functions::{authorize_once, initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained},
        protocol_types::address::AztecAddress,
        state_vars::{Map, PublicImmutable, PublicMutable},
    };

    use dep::uint_note::uint_note::{PartialUintNote, UintNote};

    use crate::types::balance_set::BalanceSet;

    global INITIAL_TRANSFER_CALL_MAX_NOTES: u32 = 2;
    global RECURSIVE_TRANSFER_CALL_MAX_NOTES: u32 = 8;

    #[event]
    struct Transfer {
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
    }

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, BalanceSet<Context>, Context>,
        total_supply: PublicMutable<u128, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        symbol: PublicImmutable<FieldCompressedString, Context>,
        name: PublicImmutable<FieldCompressedString, Context>,
        decimals: PublicImmutable<u8, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(name: str<31>, symbol: str<31>, decimals: u8) {
        storage.name.initialize(FieldCompressedString::from_string(name));
        storage.symbol.initialize(FieldCompressedString::from_string(symbol));
        storage.decimals.initialize(decimals);
    }

    #[public]
    #[view]
    fn public_get_name() -> FieldCompressedString {
        storage.name.read()
    }

    #[public]
    #[view]
    fn public_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read()
    }

    #[public]
    #[view]
    fn public_get_decimals() -> pub u8 {
        storage.decimals.read()
    }

    #[public]
    #[view]
    fn public_total_supply() -> u128 {
        storage.total_supply.read()
    }

    #[public]
    #[view]
    fn public_balance_of(owner: AztecAddress) -> u128 {
        storage.public_balances.at(owner).read()
    }

    #[utility]
    pub(crate) unconstrained fn private_balance_of(owner: AztecAddress) -> u128 {
        storage.balances.at(owner).balance_of()
    }

    #[public]
    fn mint_publicly(to: AztecAddress, amount: u128) {
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);
        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[public]
    fn public_transfer(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);
        let to_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(to_balance);
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[public]
    fn burn_public(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[private]
    fn transfer_from_private_to_public(
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
    ) {
        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        SimpleToken::at(context.this_address())._increase_public_balance(to, amount).enqueue(
            &mut context,
        );
    }

    #[private]
    fn private_transfer(to: AztecAddress, amount: u128) {
        let from = context.msg_sender();

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

        emit_event_in_private_log(
            Transfer { from, to, amount },
            &mut context,
            from,
            to,
            PrivateLogContent.NO_CONSTRAINTS,
        );
    }

    #[authorize_once("from".as_ctstring(), "authwit_nonce".as_ctstring())]
    #[private]
    fn burn_private(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        SimpleToken::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
    }

    #[private]
    fn transfer_from_public_to_private(to: AztecAddress, amount: u128) {
        let from = context.msg_sender();
        let token = SimpleToken::at(context.this_address());

        let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);
        token._finalize_transfer_to_private_unsafe(from, amount, partial_note).enqueue(&mut context);
    }

    #[private]
    fn prepare_private_balance_increase(to: AztecAddress, from: AztecAddress) -> PartialUintNote {
        _prepare_private_balance_increase(from, to, &mut context, storage)
    }

    #[contract_library_method]
    fn _prepare_private_balance_increase(
        from: AztecAddress,
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
            from,
        );

        partial_note
    }

    #[public]
    fn finalize_transfer_to_private(amount: u128, partial_note: PartialUintNote) {
        let from_and_completer = context.msg_sender();
        _finalize_transfer_to_private(
            from_and_completer,
            amount,
            partial_note,
            &mut context,
            storage,
        );
    }

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

    #[contract_library_method]
    fn _finalize_transfer_to_private(
        from_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        let from_balance = storage.public_balances.at(from_and_completer).read().sub(amount);
        storage.public_balances.at(from_and_completer).write(from_balance);

        partial_note.complete(context, from_and_completer, amount);
    }

    #[private]
    fn mint_privately(from: AztecAddress, to: AztecAddress, amount: u128) {
        let token = SimpleToken::at(context.this_address());
        let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);
        token._finalize_mint_to_private_unsafe(context.msg_sender(), amount, partial_note).enqueue(
            &mut context,
        );
    }

    #[public]
    fn finalize_mint_to_private(amount: u128, partial_note: PartialUintNote) {
        _finalize_mint_to_private(
            context.msg_sender(),
            amount,
            partial_note,
            &mut context,
            storage,
        );
    }

    #[public]
    #[internal]
    fn _finalize_mint_to_private_unsafe(
        minter_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
    ) {
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
        completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        let supply = storage.total_supply.read().add(amount);
        storage.total_supply.write(supply);

        partial_note.complete(context, completer, amount);
    }

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
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    #[private]
    fn cancel_authwit(inner_hash: Field) {
        let on_behalf_of = context.msg_sender();
        let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
        context.push_nullifier(nullifier);
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
        assert(subtracted > 0 as u128, "Balance too low");
        if subtracted >= amount {
            subtracted - amount
        } else {
            let remaining = amount - subtracted;
            compute_recurse_subtract_balance_call(*context, account, remaining).call(context)
        }
    }

    #[no_predicates]
    #[contract_library_method]
    fn compute_recurse_subtract_balance_call(
        context: PrivateContext,
        account: AztecAddress,
        remaining: u128,
    ) -> PrivateCallInterface<25, u128, 1> {
        SimpleToken::at(context.this_address())._recurse_subtract_balance(account, remaining)
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
}
